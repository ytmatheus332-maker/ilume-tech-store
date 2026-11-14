
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

interface PixPayment {
  orderId: string;
  transactionId: string;
  status: string;
  amountCents: number;
  copyPaste: string;
  expiresAt: string | null;
}

interface CheckoutIdentity {
  fingerprint: string;
  id: string;
}

interface CheckoutCustomer {
  name: string;
  email: string;
  phone: string;
  cpf: string;
}

const CHECKOUT_REQUEST_KEY = "ilume_checkout_request_id";

let memoryCheckoutIdentity: CheckoutIdentity | null = null;

function createCheckoutRequestId(): string {
  return crypto.randomUUID();
}

function isValidUUID(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function createCheckoutFingerprint(
  cart: any[],
  customer: CheckoutCustomer
): string {
  const normalizedItems = cart
    .map((item) => ({
      variantId: String(item.variantId || item.id || ""),
      quantity: Number(item.quantity || 1)
    }))
    .sort((a, b) => a.variantId.localeCompare(b.variantId));

  return JSON.stringify({
    items: normalizedItems,
    customer: {
      name: customer.name.trim(),
      email: customer.email.trim().toLowerCase(),
      phone: normalizeDigits(customer.phone),
      cpf: normalizeDigits(customer.cpf)
    }
  });
}

function getCheckoutRequestId(fingerprint: string): string {
  try {
    const savedValue = sessionStorage.getItem(CHECKOUT_REQUEST_KEY);

    if (savedValue) {
      const saved = JSON.parse(savedValue) as CheckoutIdentity;

      if (
        saved.fingerprint === fingerprint &&
        isValidUUID(saved.id)
      ) {
        memoryCheckoutIdentity = saved;
        return saved.id;
      }
    }

    const identity: CheckoutIdentity = {
      fingerprint,
      id: createCheckoutRequestId()
    };

    sessionStorage.setItem(
      CHECKOUT_REQUEST_KEY,
      JSON.stringify(identity)
    );

    memoryCheckoutIdentity = identity;

    return identity.id;
  } catch {
    if (
      memoryCheckoutIdentity?.fingerprint === fingerprint &&
      isValidUUID(memoryCheckoutIdentity.id)
    ) {
      return memoryCheckoutIdentity.id;
    }

    const identity: CheckoutIdentity = {
      fingerprint,
      id: createCheckoutRequestId()
    };

    memoryCheckoutIdentity = identity;

    return identity.id;
  }
}

function clearCheckoutRequestId(): void {
  memoryCheckoutIdentity = null;

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

  const [gateway, setGateway] = useState<Gateway | null>(null);
  const [gatewayLoading, setGatewayLoading] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pixPayment, setPixPayment] = useState<PixPayment | null>(null);
  const [qrCodeImage, setQrCodeImage] = useState("");
  const [qrCodeError, setQrCodeError] = useState(false);
  const [copied, setCopied] = useState(false);

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

        const data = await response.json();

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

    if (pixPayment) {
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

    try {
      setLoading(true);
      setError(null);

      const customer: CheckoutCustomer = {
        name: name.trim(),
        email: email.trim(),
        phone,
        cpf
      };

      const fingerprint = createCheckoutFingerprint(
        cart,
        customer
      );

      const checkoutRequestId = getCheckoutRequestId(fingerprint);

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
          items: itemsPayload,
        }),
      });

      const data = await response.json();

      // Resposta inconclusiva: preservar a chave para retry.
      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            "Não foi possível confirmar o resultado do pagamento. Tente novamente."
        );
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
          String(data.payment.status || "").toUpperCase() === "PAID"
        )
      ) {
        const payment: PixPayment = {
          orderId: data.orderId,
          transactionId: data.transactionId,
          status: data.payment.status || "PENDING",
          amountCents: Number(data.payment.amountCents),
          copyPaste: data.payment.copyPaste || "",
          expiresAt: data.payment.expiresAt || null,
        };

        setPixPayment(payment);

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

  const isPixPaid = pixPayment?.status.toUpperCase() === "PAID";

  if (cart.length === 0 && !pixPayment) {
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

        {pixPayment ? (
          <section className="checkout-pix-panel">
            <div className="checkout-pix-icon">
              <QrCode size={34} />
            </div>

            <span className="checkout-confirmation-brand">
              ILUME TECH STORE
            </span>

            <h1>{isPixPaid ? "Pagamento aprovado" : "Finalize seu pagamento"}</h1>

            <p className="checkout-pix-description">
              {isPixPaid
                ? "O pagamento deste pedido foi confirmado."
                : "Seu pedido foi registrado. Escaneie o QR Code ou copie o código PIX para realizar o pagamento."}
            </p>

            <div className="checkout-pix-status">
              {isPixPaid ? (
                <CheckCircle2 size={18} />
              ) : (
                <Clock3 size={18} />
              )}
              <div>
                <strong>
                  {isPixPaid
                    ? "Pagamento aprovado"
                    : "Pagamento aguardando confirmação"}
                </strong>
                <p>
                  {isPixPaid
                    ? "Seu pagamento foi confirmado pela BravoPay."
                    : "O pedido ainda não está confirmado."}
                </p>
              </div>
            </div>

            <div className="checkout-pix-order">
              <span>NÚMERO DO PEDIDO</span>
              <strong>{pixPayment.orderId}</strong>
            </div>

            {!isPixPaid && (
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

            {!isPixPaid && (
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

            {!isPixPaid && (
              <div className="checkout-pix-expiration">
              <Clock3 size={15} />
              <span>
                Validade informada: {formatExpiration(pixPayment.expiresAt)}
              </span>
              </div>
            )}

            <p className="checkout-pix-disclaimer">
              Após pagar, aguarde a confirmação do pagamento. Não realize
              outro pagamento para este pedido.
            </p>

            <Link to="/" className="checkout-confirmation-button">
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

                <section className="checkout-section checkout-payment-section">
                  <div className="checkout-section-heading">
                    <span>02</span>
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
