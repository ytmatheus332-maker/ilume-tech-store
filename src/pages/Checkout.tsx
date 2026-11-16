
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Lock,
  ShieldCheck,
  Copy,
  CheckCircle2,
  QrCode,
  Clock3,
  ShoppingBag,
  AlertCircle,
} from "lucide-react";
import * as QRCode from "qrcode";

import { useCart } from "../context/CartContext";
import "./Checkout.css";

type Gateway = "mercadopago" | "bravopay";

interface CheckoutCustomer {
  name: string;
  email: string;
  phone: string;
  cpf: string;
}

interface CheckoutAddress {
  recipientName: string;
  recipientPhone: string;
  postalCode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  reference: string;
}

interface PixPayment {
  orderId: string;
  transactionId: string | null;
  status: string;
  amountCents: number;
  copyPaste: string;
  expiresAt: string | null;
}

interface AddressTestResult {
  orderId: string;
}

const CHECKOUT_REQUEST_KEY = "ilume_checkout_request_id";

let memoryCheckoutRequestId: string | null = null;

function createCheckoutRequestId(): string {
  return crypto.randomUUID();
}

function isValidUUID(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function readCheckoutRequestId(
  storage: Storage,
  allowLegacyJson: boolean
): string | null {
  const savedValue = storage.getItem(CHECKOUT_REQUEST_KEY);

  if (isValidUUID(savedValue)) {
    return savedValue;
  }

  if (!allowLegacyJson || !savedValue) {
    return null;
  }

  try {
    const legacyIdentity = JSON.parse(savedValue) as { id?: unknown };
    return isValidUUID(legacyIdentity.id) ? legacyIdentity.id : null;
  } catch {
    return null;
  }
}

function getCheckoutRequestId(): string {
  if (isValidUUID(memoryCheckoutRequestId)) {
    return memoryCheckoutRequestId;
  }

  let savedId: string | null = null;

  try {
    savedId = readCheckoutRequestId(localStorage, false);
  } catch {
    // Tenta recuperar o identificador da sessão abaixo.
  }

  if (!savedId) {
    try {
      savedId = readCheckoutRequestId(sessionStorage, true);
    } catch {
      // Um novo identificador ficará em memória nesta sessão.
    }
  }

  if (savedId) {
    memoryCheckoutRequestId = savedId;

    try {
      localStorage.setItem(CHECKOUT_REQUEST_KEY, savedId);
      sessionStorage.removeItem(CHECKOUT_REQUEST_KEY);
    } catch {
      try {
        sessionStorage.setItem(CHECKOUT_REQUEST_KEY, savedId);
      } catch {
        // A memória mantém a identidade até o fim desta sessão.
      }
    }

    return savedId;
  }

  const newId = createCheckoutRequestId();
  memoryCheckoutRequestId = newId;

  try {
    localStorage.setItem(CHECKOUT_REQUEST_KEY, newId);
  } catch {
    try {
      sessionStorage.setItem(CHECKOUT_REQUEST_KEY, newId);
    } catch {
      // A memória mantém a identidade até o fim desta sessão.
    }
  }

  return newId;
}

function getStoredCheckoutRequestId(): string | null {
  try {
    const localId = readCheckoutRequestId(localStorage, false);
    if (localId) return localId;
  } catch {
    // Tenta a chave da sessão abaixo.
  }

  try {
    return readCheckoutRequestId(sessionStorage, true);
  } catch {
    return null;
  }
}

function clearCheckoutRequestId(): void {
  memoryCheckoutRequestId = null;

  try {
    localStorage.removeItem(CHECKOUT_REQUEST_KEY);
  } catch {
    // A chave de sessão poderá ser removida separadamente.
  }

  try {
    sessionStorage.removeItem(CHECKOUT_REQUEST_KEY);
  } catch {
    // A chave poderá ser descartada ao encerrar a sessão.
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatExpiration(value: string | null): string {
  if (!value) return "Consulte a validade no aplicativo do seu banco.";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Consulte a validade no aplicativo do seu banco.";
  }

  return date.toLocaleString("pt-BR");
}

export default function Checkout() {
  const { cart, clearCart, total } = useCart();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");

  // Endereço de entrega: obrigatório para qualquer gateway.
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [reference, setReference] = useState("");

  const [gateway, setGateway] = useState<Gateway | null>(null);
  const [gatewayLoading, setGatewayLoading] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pixPayment, setPixPayment] = useState<PixPayment | null>(null);
  const [addressTestResult, setAddressTestResult] =
    useState<AddressTestResult | null>(null);

  const [qrCodeImage, setQrCodeImage] = useState("");
  const [qrCodeError, setQrCodeError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [recoveryRequestId, setRecoveryRequestId] = useState<string | null>(null);
  const [recoveryPending, setRecoveryPending] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadGateway() {
      try {
        setGatewayLoading(true);
        setError(null);

        const response = await fetch("/api/create-checkout", {
          method: "GET",
          cache: "no-store",
        });

        const data = await response.json().catch(() => null);

        if (!response.ok || !data.success) {
          throw new Error(
            data.error || "Não foi possível consultar o pagamento."
          );
        }

        if (
          data.gateway !== "mercadopago" &&
          data.gateway !== "bravopay"
        ) {
          throw new Error("O meio de pagamento configurado é inválido.");
        }

        if (active) {
          setGateway(data.gateway);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Não foi possível carregar o checkout."
          );
        }
      } finally {
        if (active) {
          setGatewayLoading(false);
        }
      }
    }

    loadGateway();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const savedRequestId = getStoredCheckoutRequestId();
    if (savedRequestId) setRecoveryRequestId(savedRequestId);
  }, []);

  useEffect(() => {
    // Uma confirmação do modo de teste nunca deve consultar gateways.
    if (addressTestResult) return;

    const currentPixStatus = String(pixPayment?.status || "").toUpperCase();
    const isCurrentPaymentPending =
      !pixPayment || currentPixStatus === "PENDING";

    if (!recoveryRequestId || !isCurrentPaymentPending) return;

    const requestId = recoveryRequestId;
    let active = true;
    let timer: number | null = null;
    let pollCount = 0;
    const intervals = [2000, 4000, 8000, 15000];

    function scheduleNextPoll() {
      if (!active) return;
      const delay = intervals[Math.min(pollCount, intervals.length - 1)];
      pollCount += 1;
      timer = window.setTimeout(pollPaymentStatus, delay);
    }

    setRecoveryPending(true);

    async function pollPaymentStatus() {
      try {
        const response = await fetch("/api/create-checkout", {
          method: "GET",
          cache: "no-store",
          headers: { "X-Checkout-Request-Id": requestId }
        });
        const data = await response.json().catch(() => null);

        if (!active) return;

        if (data?.state === "not_found") {
          setRecoveryPending(false);
          setRecoveryRequestId(null);
          return;
        }

        const payment = data?.payment;
        const status = String(payment?.status || "").toUpperCase();
        const terminalStatus = [
          "PAID", "EXPIRED", "FAILED", "REFUNDED", "CHARGEBACK"
        ].includes(status);

        if (
          data?.success === true &&
          data.orderId &&
          (data.state === "available" || data.state === "paid" || data.state === "terminal") &&
          payment &&
          (data.transactionId || terminalStatus) &&
          (Boolean(payment.copyPaste) || terminalStatus)
        ) {
          const recoveredPayment: PixPayment = {
            orderId: data.orderId,
            transactionId: data.transactionId,
            status,
            amountCents: Number(payment.amountCents),
            copyPaste: payment.copyPaste || "",
            expiresAt: payment.expiresAt || null
          };

          setPixPayment(recoveredPayment);
          setRecoveryPending(false);
          if (terminalStatus) setRecoveryRequestId(null);
          setError(null);

          if (recoveredPayment.copyPaste) {
            try {
              const image = await QRCode.toDataURL(recoveredPayment.copyPaste, {
                errorCorrectionLevel: "M",
                margin: 2,
                width: 260
              });
              if (active) setQrCodeImage(image);
            } catch (qrError) {
              console.error("ILUME: Erro ao gerar QR Code.", qrError);
              if (active) setQrCodeError(true);
            }
          }
          if (!terminalStatus) scheduleNextPoll();
          return;
        }
      } catch {
        // Falha temporária de consulta: mantém a identidade e tenta novamente.
      }

      scheduleNextPoll();
    }

    pollPaymentStatus();

    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [recoveryRequestId, pixPayment?.status, addressTestResult]);

  async function handleFinishCheckout(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) return;

    if (cart.length === 0) {
      setError("Seu carrinho está vazio.");
      return;
    }

    if (!gateway) {
      setError("O meio de pagamento ainda não foi identificado.");
      return;
    }

    if (pixPayment || addressTestResult) {
      return;
    }

    if (!name.trim() || !email.trim()) {
      setError("Preencha seu nome e e-mail.");
      return;
    }

    if (gateway === "bravopay" && (!phone.trim() || !cpf.trim())) {
      setError("Preencha seu telefone e CPF.");
      return;
    }

    const normalizedRecipientPhone = recipientPhone.replace(/\D/g, "");
    const normalizedPostalCode = postalCode.replace(/\D/g, "");

    if (
      !recipientName.trim() ||
      normalizedRecipientPhone.length < 10 ||
      normalizedRecipientPhone.length > 13 ||
      normalizedPostalCode.length !== 8 ||
      !street.trim() ||
      !number.trim() ||
      !neighborhood.trim() ||
      !city.trim() ||
      !/^[A-Za-z]{2}$/.test(state.trim())
    ) {
      setError(
        "Confira o endereço de entrega. Preencha todos os campos obrigatórios e informe um CEP e telefone válidos."
      );
      return;
    }

    let submittedCheckoutRequestId: string | null = null;

    try {
      setLoading(true);
      setError(null);

      const customer: CheckoutCustomer = {
        name: name.trim(),
        email: email.trim(),
        phone,
        cpf
      };

      const address: CheckoutAddress = {
        recipientName: recipientName.trim(),
        recipientPhone: normalizedRecipientPhone,
        postalCode: normalizedPostalCode,
        street: street.trim(),
        number: number.trim(),
        complement: complement.trim(),
        neighborhood: neighborhood.trim(),
        city: city.trim(),
        state: state.trim().toUpperCase(),
        reference: reference.trim()
      };

      const checkoutRequestId = getCheckoutRequestId();
      submittedCheckoutRequestId = checkoutRequestId;

      const itemsPayload = cart.map((item) => ({
        variantId: item.variantId || item.id,
        quantity: item.quantity || 1,
      }));

      const response = await fetch("/api/create-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          checkoutRequestId,
          customer,
          address,
          items: itemsPayload,
        }),
      });

      const data = await response.json().catch(() => null);

      // Resposta inconclusiva: preservar a chave para retry.
      if (!response.ok || !data?.success) {
        if (data?.terminal === true) {
          clearCheckoutRequestId();
          setRecoveryRequestId(null);
          setRecoveryPending(false);
        } else {
          setRecoveryRequestId(checkoutRequestId);
          setRecoveryPending(true);
        }

        setError(
          data?.error ||
            "Não foi possível confirmar o pagamento. Sua tentativa foi preservada; tente recuperar este mesmo pedido em instantes."
        );
        return;
      }

      // Modo de teste: endereço salvo, sem iniciar cobrança.
      if (data.testMode === true) {
        if (
          data.addressSaved !== true ||
          data.gatewayCalled !== false ||
          typeof data.orderId !== "string" ||
          !data.orderId
        ) {
          throw new Error(
            "A resposta do teste de endereço não foi confirmada corretamente."
          );
        }

        clearCheckoutRequestId();
        setRecoveryRequestId(null);
        setRecoveryPending(false);
        setPixPayment(null);
        setAddressTestResult({
          orderId: data.orderId
        });
        setError(null);

        return;
      }

      // Mercado Pago.
      if (data.gateway === "mercadopago") {
        if (!data.paymentUrl) {
          throw new Error(
            "O Mercado Pago não retornou o link de pagamento."
          );
        }

        clearCheckoutRequestId();
        clearCart();
        setRecoveryRequestId(null);
        setRecoveryPending(false);

        window.location.href = data.paymentUrl;
        return;
      }

      // BravoPay PIX.
      if (
        data.gateway === "bravopay" &&
        data.payment &&
        data.orderId &&
        data.transactionId &&
        (
          data.payment.copyPaste ||
          ["PAID", "EXPIRED", "FAILED", "REFUNDED", "CHARGEBACK"].includes(
            String(data.payment.status || "").toUpperCase()
          )
        )
      ) {
        const payment: PixPayment = {
          orderId: data.orderId,
          transactionId: data.transactionId,
          status: String(data.payment.status || "PENDING").toUpperCase(),
          amountCents: Number(data.payment.amountCents),
          copyPaste: data.payment.copyPaste || "",
          expiresAt: data.payment.expiresAt || null,
        };

        setPixPayment(payment);
        setRecoveryRequestId(
          payment.status === "PENDING" ? checkoutRequestId : null
        );
        setRecoveryPending(false);

        if (payment.copyPaste) {
          try {
            const image = await QRCode.toDataURL(payment.copyPaste, {
              errorCorrectionLevel: "M",
              margin: 2,
              width: 260,
            });

            setQrCodeImage(image);
          } catch (qrError) {
            console.error("ILUME: Erro ao gerar QR Code.", qrError);
            setQrCodeError(true);
          }
        }

        // Não remover a chave após exibir o PIX.
        // Ela protege a mesma compra contra cobranças duplicadas.

        return;
      }

      throw new Error(
        "A resposta do gateway possui um formato inesperado."
      );
    } catch (err) {
      if (submittedCheckoutRequestId) {
        setRecoveryRequestId(submittedCheckoutRequestId);
        setRecoveryPending(true);
      }
      setError(
        err instanceof Error
          ? err.message
          : "Ocorreu um erro ao processar o pedido."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyPix() {
    if (!pixPayment?.copyPaste) return;

    try {
      await navigator.clipboard.writeText(pixPayment.copyPaste);
      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 2500);
    } catch {
      setError(
        "Não foi possível copiar automaticamente. Selecione e copie o código PIX."
      );
    }
  }

  const pixStatus = String(pixPayment?.status || "PENDING").toUpperCase();
  const isPixPaid = pixStatus === "PAID";
  const isPixTerminal = ["EXPIRED", "FAILED", "REFUNDED", "CHARGEBACK"].includes(
    pixStatus
  );
  const canPayWithPix = !isPixPaid && !isPixTerminal;

  const pixStatusLabel =
    pixStatus === "EXPIRED"
      ? "PIX expirado"
      : pixStatus === "FAILED"
        ? "Pagamento não concluído"
        : pixStatus === "REFUNDED"
          ? "Pagamento estornado"
          : pixStatus === "CHARGEBACK"
            ? "Pagamento contestado"
            : isPixPaid
              ? "Pagamento aprovado"
              : "Pagamento aguardando confirmação";

  const pixStatusMessage =
    pixStatus === "EXPIRED"
      ? "Esta cobrança expirou. Não tente pagar este código PIX."
      : pixStatus === "FAILED"
        ? "Esta cobrança não foi concluída. Não tente pagá-la novamente."
        : pixStatus === "REFUNDED"
          ? "Este pagamento foi estornado."
          : pixStatus === "CHARGEBACK"
            ? "Este pagamento está contestado."
            : isPixPaid
              ? "Seu pagamento foi confirmado pela BravoPay."
              : "O pedido ainda não está confirmado.";

  if (cart.length === 0 && !pixPayment && !addressTestResult) {
    return (
      <main className="checkout-page">
        <div className="checkout-empty">
          <ShoppingBag size={42} strokeWidth={1.3} />
          <h1>Sua sacola está vazia.</h1>
          <p>Adicione produtos antes de finalizar seu pedido.</p>
          <Link to="/">Voltar para a loja</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="checkout-page">
      <div className="checkout-container">
        <Link to="/carrinho" className="checkout-back">
          <ArrowLeft size={14} />
          Voltar para a sacola
        </Link>

        {addressTestResult ? (
          <section className="checkout-pix-panel">
            <div className="checkout-pix-icon">
              <CheckCircle2 size={34} />
            </div>

            <span className="checkout-confirmation-brand">
              ILUME TECH STORE
            </span>

            <h1>Endereço salvo com sucesso</h1>

            <p className="checkout-pix-description">
              O pedido foi registrado e o endereço de entrega foi salvo
              corretamente. Este foi um teste de persistência: nenhuma
              cobrança foi criada.
            </p>

            <div className="checkout-pix-status">
              <CheckCircle2 size={18} />
              <div>
                <strong>Teste concluído</strong>
                <p>
                  Endereço confirmado no banco de dados. Nenhum pagamento
                  foi iniciado.
                </p>
              </div>
            </div>

            <div className="checkout-pix-order">
              <span>NÚMERO DO PEDIDO DE TESTE</span>
              <strong>{addressTestResult.orderId}</strong>
            </div>

            <p className="checkout-pix-disclaimer">
              Este pedido está em ambiente de teste e não representa uma
              compra paga.
            </p>

            <Link
              to="/"
              className="checkout-confirmation-button"
            >
              Voltar para a loja
            </Link>
          </section>
        ) : pixPayment ? (
          <section className="checkout-pix-panel">
            <div className="checkout-pix-icon">
              <QrCode size={34} />
            </div>

            <span className="checkout-confirmation-brand">
              ILUME TECH STORE
            </span>

            <h1>
              {isPixPaid
                ? "Pagamento aprovado"
                : isPixTerminal
                  ? "Pagamento indisponível"
                  : "Finalize seu pagamento"}
            </h1>

            <p className="checkout-pix-description">
              {isPixPaid
                ? "O pagamento deste pedido foi confirmado."
                : isPixTerminal
                  ? pixStatusMessage
                  : "Seu pedido foi registrado. Escaneie o QR Code ou copie o código PIX para realizar o pagamento."}
            </p>

            <div className="checkout-pix-status">
              {isPixPaid ? (
                <CheckCircle2 size={18} />
              ) : isPixTerminal ? (
                <AlertCircle size={18} />
              ) : (
                <Clock3 size={18} />
              )}
              <div>
                <strong>{pixStatusLabel}</strong>
                <p>{pixStatusMessage}</p>
              </div>
            </div>

            <div className="checkout-pix-order">
              <span>NÚMERO DO PEDIDO</span>
              <strong>{pixPayment.orderId}</strong>
            </div>

            {canPayWithPix && (
              <div className="checkout-pix-qr">
                {qrCodeImage ? (
                  <img
                    src={qrCodeImage}
                    alt="QR Code para pagamento PIX"
                  />
                ) : (
                  <div className="checkout-pix-qr-placeholder">
                    {qrCodeError ? (
                      <AlertCircle size={32} />
                    ) : (
                      <QrCode size={32} />
                    )}
                    <span>
                      {qrCodeError
                        ? "QR Code indisponível. Utilize o código PIX abaixo."
                        : "Preparando QR Code..."}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="checkout-pix-amount">
              <span>VALOR DO PEDIDO</span>
              <strong>
                {formatCurrency(pixPayment.amountCents / 100)}
              </strong>
            </div>

            {canPayWithPix && (
              <div className="checkout-pix-copy">
                <label htmlFor="pix-copy-paste">
                  PIX copia e cola
                </label>

                <textarea
                  id="pix-copy-paste"
                  value={pixPayment.copyPaste}
                  readOnly
                  rows={4}
                />

                <button
                  type="button"
                  className="checkout-submit checkout-pix-copy-button"
                  onClick={handleCopyPix}
                >
                  {copied ? (
                    <>
                      <CheckCircle2 size={17} />
                      Código copiado
                    </>
                  ) : (
                    <>
                      <Copy size={17} />
                      Copiar código PIX
                    </>
                  )}
                </button>
              </div>
            )}

            {canPayWithPix && (
              <div className="checkout-pix-expiration">
                <Clock3 size={15} />
                <span>
                  Validade informada: {formatExpiration(pixPayment.expiresAt)}
                </span>
              </div>
            )}

            <p className="checkout-pix-disclaimer">
              {isPixPaid
                ? "Pagamento confirmado. Não realize outro pagamento para este pedido."
                : isPixTerminal
                  ? "Não realize outro pagamento usando esta cobrança."
                  : "Após pagar, aguarde a confirmação do pagamento. Não realize outro pagamento para este pedido."}
            </p>

            <Link
              to="/"
              className="checkout-confirmation-button"
              onClick={() => {
                if (isPixPaid || isPixTerminal) {
                  clearCheckoutRequestId();

                  if (isPixPaid) {
                    clearCart();
                  }
                }
              }}
            >
              Voltar para a loja
            </Link>
          </section>
        ) : (
          <>
            <header className="checkout-heading">
              <span>ILUME TECH STORE</span>
              <h1>Finalizar pedido</h1>
              <p>
                Informe seus dados para continuar com segurança.
              </p>
            </header>

            {error && (
              <div className="checkout-alert" role="alert">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            {recoveryPending && (
              <div className="checkout-alert" role="status">
                <Clock3 size={18} />
                <span>
                  Estamos consultando a mesma cobrança na BravoPay. Esta tela pode permanecer aberta; não será criada outra cobrança durante a consulta.
                </span>
              </div>
            )}

            <div className="checkout-layout">
              <form
                className="checkout-form"
                onSubmit={handleFinishCheckout}
              >
                <section className="checkout-section">
                  <div className="checkout-section-heading">
                    <span>01</span>
                    <div>
                      <h2>Dados pessoais</h2>
                      <p>Preencha as informações do comprador.</p>
                    </div>
                  </div>

                  <div className="checkout-fields">
                    <label className="checkout-field checkout-field-full">
                      Nome completo
                      <input
                        type="text"
                        placeholder="Seu nome completo"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        minLength={3}
                        maxLength={150}
                        autoComplete="name"
                        required
                        disabled={loading || gatewayLoading}
                      />
                    </label>

                    <label className="checkout-field checkout-field-full">
                      E-mail
                      <input
                        type="email"
                        placeholder="seu@email.com"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        maxLength={254}
                        autoComplete="email"
                        required
                        disabled={loading || gatewayLoading}
                      />
                    </label>

                    {gateway === "bravopay" && (
                      <>
                        <label className="checkout-field">
                          Telefone com DDD
                          <input
                            type="tel"
                            placeholder="(00) 00000-0000"
                            value={phone}
                            onChange={(event) => setPhone(event.target.value)}
                            autoComplete="tel"
                            inputMode="tel"
                            required
                            disabled={loading}
                          />
                        </label>

                        <label className="checkout-field">
                          CPF
                          <input
                            type="text"
                            placeholder="000.000.000-00"
                            value={cpf}
                            onChange={(event) => setCpf(event.target.value)}
                            autoComplete="off"
                            inputMode="numeric"
                            maxLength={14}
                            required
                            disabled={loading}
                          />
                        </label>
                      </>
                    )}
                  </div>
                </section>

                <section className="checkout-section">
                  <div className="checkout-section-heading">
                    <span>02</span>
                    <div>
                      <h2>Endereço de entrega</h2>
                      <p>
                        Informe onde deseja receber seu pedido.
                      </p>
                    </div>
                  </div>

                  <div className="checkout-fields">
                    <label className="checkout-field checkout-field-full">
                      Nome do destinatário
                      <input
                        type="text"
                        placeholder="Nome de quem receberá o pedido"
                        value={recipientName}
                        onChange={(event) => setRecipientName(event.target.value)}
                        minLength={3}
                        maxLength={150}
                        autoComplete="shipping name"
                        required
                        disabled={loading}
                      />
                    </label>

                    <label className="checkout-field">
                      Telefone do destinatário
                      <input
                        type="tel"
                        placeholder="(00) 00000-0000"
                        value={recipientPhone}
                        onChange={(event) => setRecipientPhone(event.target.value)}
                        autoComplete="shipping tel"
                        inputMode="tel"
                        required
                        disabled={loading}
                      />
                    </label>

                    <label className="checkout-field">
                      CEP
                      <input
                        type="text"
                        placeholder="00000-000"
                        value={postalCode}
                        onChange={(event) => setPostalCode(event.target.value)}
                        maxLength={9}
                        autoComplete="shipping postal-code"
                        inputMode="numeric"
                        required
                        disabled={loading}
                      />
                    </label>

                    <label className="checkout-field checkout-field-full">
                      Rua / Avenida
                      <input
                        type="text"
                        placeholder="Nome da rua ou avenida"
                        value={street}
                        onChange={(event) => setStreet(event.target.value)}
                        maxLength={200}
                        autoComplete="shipping address-line1"
                        required
                        disabled={loading}
                      />
                    </label>

                    <label className="checkout-field">
                      Número
                      <input
                        type="text"
                        placeholder="Número"
                        value={number}
                        onChange={(event) => setNumber(event.target.value)}
                        maxLength={30}
                        autoComplete="shipping address-line2"
                        required
                        disabled={loading}
                      />
                    </label>

                    <label className="checkout-field">
                      Complemento
                      <input
                        type="text"
                        placeholder="Apto, bloco, casa..."
                        value={complement}
                        onChange={(event) => setComplement(event.target.value)}
                        maxLength={100}
                        disabled={loading}
                      />
                    </label>

                    <label className="checkout-field checkout-field-full">
                      Bairro
                      <input
                        type="text"
                        placeholder="Seu bairro"
                        value={neighborhood}
                        onChange={(event) => setNeighborhood(event.target.value)}
                        maxLength={100}
                        autoComplete="shipping address-level3"
                        required
                        disabled={loading}
                      />
                    </label>

                    <label className="checkout-field">
                      Cidade
                      <input
                        type="text"
                        placeholder="Sua cidade"
                        value={city}
                        onChange={(event) => setCity(event.target.value)}
                        maxLength={100}
                        autoComplete="shipping address-level2"
                        required
                        disabled={loading}
                      />
                    </label>

                    <label className="checkout-field">
                      Estado (UF)
                      <input
                        type="text"
                        placeholder="Ex.: SP"
                        value={state}
                        onChange={(event) => setState(event.target.value.toUpperCase())}
                        maxLength={2}
                        minLength={2}
                        autoComplete="shipping address-level1"
                        required
                        disabled={loading}
                      />
                    </label>

                    <label className="checkout-field checkout-field-full">
                      Ponto de referência (opcional)
                      <input
                        type="text"
                        placeholder="Ex.: próximo à praça"
                        value={reference}
                        onChange={(event) => setReference(event.target.value)}
                        maxLength={200}
                        disabled={loading}
                      />
                    </label>
                  </div>
                </section>

                <section className="checkout-section checkout-payment-section">
                  <div className="checkout-section-heading">
                    <span>03</span>
                    <div>
                      <h2>Meio de pagamento</h2>
                      <p>
                        O pagamento é processado pelo gateway configurado
                        pela administração da ILUME.
                      </p>
                    </div>
                  </div>

                  {gatewayLoading ? (
                    <div className="checkout-loading">
                      Consultando meio de pagamento...
                    </div>
                  ) : gateway === "mercadopago" ? (
                    <div className="checkout-payment-option checkout-payment-option-selected">
                      <div className="checkout-payment-icon">
                        <Lock size={21} />
                      </div>
                      <div className="checkout-payment-info">
                        <strong>Mercado Pago</strong>
                        <small>
                          Você será direcionado ao ambiente seguro do
                          Mercado Pago para concluir o pagamento.
                        </small>
                      </div>
                    </div>
                  ) : gateway === "bravopay" ? (
                    <div className="checkout-payment-option checkout-payment-option-selected">
                      <div className="checkout-payment-icon">
                        <QrCode size={23} />
                      </div>
                      <div className="checkout-payment-info">
                        <strong>PIX</strong>
                        <small>
                          Gere seu QR Code e pague pelo aplicativo do seu banco.
                        </small>
                      </div>
                    </div>
                  ) : (
                    <div className="checkout-loading">
                      Não foi possível identificar o gateway.
                    </div>
                  )}

                  <div className="checkout-payment-security">
                    <ShieldCheck size={16} />
                    Ambiente de pagamento protegido.
                  </div>
                </section>

                <button
                  type="submit"
                  className="checkout-submit"
                  disabled={loading || gatewayLoading || !gateway}
                >
                  {loading
                    ? "Processando pedido..."
                    : gatewayLoading
                      ? "Carregando pagamento..."
                      : gateway === "bravopay"
                        ? "Gerar pagamento PIX"
                        : "Ir para o pagamento"}
                </button>

                <p className="checkout-security">
                  <Lock size={13} />
                  Seus dados são transmitidos com segurança.
                </p>
              </form>

              <aside className="checkout-summary">
                <span>RESUMO</span>
                <h2>Seu pedido</h2>

                <div className="checkout-products">
                  {cart.map((item) => (
                    <div
                      className="checkout-product"
                      key={item.variantId || item.id}
                    >
                      {item.image ? (
                        <img src={item.image} alt={item.name} />
                      ) : (
                        <div className="checkout-product-placeholder">
                          <ShoppingBag size={20} />
                        </div>
                      )}

                      <div>
                        <strong>{item.name}</strong>
                        <span>
                          {item.color || "Padrão"}
                          {item.storage ? ` · ${item.storage} GB` : ""}
                        </span>
                        <span>Quantidade: {item.quantity}</span>
                      </div>

                      <strong>
                        {formatCurrency(item.price * item.quantity)}
                      </strong>
                    </div>
                  ))}
                </div>

                <div className="checkout-total">
                  <span>Subtotal</span>
                  <strong>{formatCurrency(total)}</strong>
                </div>

                <div className="checkout-grand-total">
                  <span>Total</span>
                  <strong>{formatCurrency(total)}</strong>
                </div>

                <p>
                  O valor final é validado pelo servidor com base nos preços
                  cadastrados no catálogo da ILUME.
                </p>
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
