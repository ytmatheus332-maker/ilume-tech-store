
import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  LockKeyhole,
  ShoppingBag,
  Truck,
  Clock3,
  PackageCheck,
  QrCode,
  CreditCard,
  Barcode,
  ShieldCheck,
  Info,
} from "lucide-react";
import { useCart } from "../context/CartContext";
import "./Checkout.css";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

interface ViaCepResponse {
  cep: string;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

interface ShippingOption {
  id: string;
  name: string;
  description: string;
  estimatedDays: string;
  price: number;
}

interface PaymentOption {
  id: string;
  name: string;
  description: string;
}

const shippingOptions: ShippingOption[] = [
  {
    id: "pac",
    name: "PAC",
    description: "Entrega econômica",
    estimatedDays: "6 a 9 dias úteis",
    price: 19.9,
  },
  {
    id: "sedex",
    name: "SEDEX",
    description: "Entrega expressa",
    estimatedDays: "2 a 4 dias úteis",
    price: 29.9,
  },
];

const paymentOptions: PaymentOption[] = [
  {
    id: "pix",
    name: "PIX",
    description: "Pagamento instantâneo via QR Code ou código copia e cola.",
  },
  {
    id: "card",
    name: "Cartão de crédito",
    description: "Pagamento com cartão e possibilidade de parcelamento.",
  },
  {
    id: "boleto",
    name: "Boleto bancário",
    description: "Pagamento por boleto bancário.",
  },
];

function formatCPF(value: string) {
  return value
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 2) {
    return digits.replace(/^(\d{0,2})/, "($1");
  }

  if (digits.length <= 6) {
    return digits.replace(/^(\d{2})(\d+)/, "($1) $2");
  }

  if (digits.length <= 10) {
    return digits.replace(/^(\d{2})(\d{4})(\d+)/, "($1) $2-$3");
  }

  return digits.replace(/^(\d{2})(\d{5})(\d+)/, "($1) $2-$3");
}

function formatCEP(value: string) {
  return value
    .replace(/\D/g, "")
    .slice(0, 8)
    .replace(/^(\d{5})(\d)/, "$1-$2");
}

export default function Checkout() {
  const { items, subtotal } = useCart();

  const [customer, setCustomer] = useState({
    name: "",
    email: "",
    cpf: "",
    phone: "",
  });

  const [address, setAddress] = useState({
    cep: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
  });

  const [cepStatus, setCepStatus] = useState("");
  const [selectedShipping, setSelectedShipping] = useState("pac");
  const [showPayment, setShowPayment] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState("pix");

  const selectedShippingOption = shippingOptions.find(
    (option) => option.id === selectedShipping
  );

  const selectedPaymentOption = paymentOptions.find(
    (option) => option.id === selectedPayment
  );

  const shippingPrice = selectedShippingOption?.price ?? 0;
  const total = subtotal + shippingPrice;

  function handleCustomerChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;

    let formattedValue = value;

    if (name === "cpf") {
      formattedValue = formatCPF(value);
    }

    if (name === "phone") {
      formattedValue = formatPhone(value);
    }

    setCustomer((current) => ({
      ...current,
      [name]: formattedValue,
    }));
  }

  function handleAddressChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;

    let formattedValue = value;

    if (name === "cep") {
      formattedValue = formatCEP(value);
      setCepStatus("");
    }

    if (name === "state") {
      formattedValue = value.toUpperCase().slice(0, 2);
    }

    setAddress((current) => ({
      ...current,
      [name]: formattedValue,
    }));
  }

  async function handleCepBlur() {
    const cep = address.cep.replace(/\D/g, "");

    if (cep.length !== 8) {
      setCepStatus("Digite um CEP válido com 8 números.");
      return;
    }

    setCepStatus("Consultando endereço...");

    try {
      const response = await fetch(
        `https://viacep.com.br/ws/${cep}/json/`
      );

      if (!response.ok) {
        throw new Error("Falha na consulta.");
      }

      const data: ViaCepResponse = await response.json();

      if (data.erro) {
        setCepStatus("CEP não encontrado. Confira os números.");
        return;
      }

      setAddress((current) => ({
        ...current,
        street: data.logradouro || current.street,
        neighborhood: data.bairro || current.neighborhood,
        city: data.localidade || current.city,
        state: data.uf || current.state,
      }));

      setCepStatus("Endereço encontrado e preenchido.");
    } catch {
      setCepStatus(
        "Não foi possível consultar o CEP. Preencha o endereço manualmente."
      );
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cpfDigits = customer.cpf.replace(/\D/g, "");
    const phoneDigits = customer.phone.replace(/\D/g, "");
    const cepDigits = address.cep.replace(/\D/g, "");

    if (cpfDigits.length !== 11) {
      alert("Confira o CPF informado.");
      return;
    }

    if (phoneDigits.length < 10) {
      alert("Confira o telefone informado.");
      return;
    }

    if (cepDigits.length !== 8) {
      alert("Confira o CEP informado.");
      return;
    }

    if (!selectedShippingOption) {
      alert("Selecione uma modalidade de entrega.");
      return;
    }

    setShowPayment(true);
  }

  if (items.length === 0) {
    return (
      <main className="checkout-empty">
        <ShoppingBag size={35} />
        <h1>Seu carrinho está vazio.</h1>
        <p>Adicione produtos antes de iniciar sua compra.</p>
        <Link to="/">Voltar para a loja</Link>
      </main>
    );
  }

  return (
    <main className="checkout-page">
      <div className="checkout-container">
        <Link to="/carrinho" className="checkout-back">
          <ArrowLeft size={16} />
          Voltar ao carrinho
        </Link>

        <div className="checkout-heading">
          <span>ILUME TECH STORE</span>
          <h1>Finalizar compra.</h1>
          <p>Preencha seus dados para continuar.</p>
        </div>

        <div className="checkout-layout">
          <form className="checkout-form" onSubmit={handleSubmit}>
            <section className="checkout-section">
              <div className="checkout-section-heading">
                <span>01</span>
                <div>
                  <h2>Dados pessoais</h2>
                  <p>Informações para identificar seu pedido.</p>
                </div>
              </div>

              <div className="checkout-fields">
                <label className="checkout-field checkout-field-full">
                  Nome completo
                  <input
                    type="text"
                    name="name"
                    value={customer.name}
                    onChange={handleCustomerChange}
                    placeholder="Digite seu nome completo"
                    autoComplete="name"
                    required
                  />
                </label>

                <label className="checkout-field">
                  E-mail
                  <input
                    type="email"
                    name="email"
                    value={customer.email}
                    onChange={handleCustomerChange}
                    placeholder="seu@email.com"
                    autoComplete="email"
                    required
                  />
                </label>

                <label className="checkout-field">
                  CPF
                  <input
                    type="text"
                    name="cpf"
                    value={customer.cpf}
                    onChange={handleCustomerChange}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                    maxLength={14}
                    autoComplete="off"
                    required
                  />
                </label>

                <label className="checkout-field checkout-field-full">
                  Telefone / WhatsApp
                  <input
                    type="tel"
                    name="phone"
                    value={customer.phone}
                    onChange={handleCustomerChange}
                    placeholder="(00) 00000-0000"
                    inputMode="numeric"
                    maxLength={15}
                    autoComplete="tel"
                    required
                  />
                </label>
              </div>
            </section>

            <section className="checkout-section">
              <div className="checkout-section-heading">
                <span>02</span>
                <div>
                  <h2>Endereço de entrega</h2>
                  <p>Onde você deseja receber seu pedido?</p>
                </div>
              </div>

              <div className="checkout-fields">
                <label className="checkout-field">
                  CEP
                  <input
                    type="text"
                    name="cep"
                    value={address.cep}
                    onChange={handleAddressChange}
                    onBlur={handleCepBlur}
                    placeholder="00000-000"
                    inputMode="numeric"
                    maxLength={9}
                    autoComplete="postal-code"
                    required
                  />

                  {cepStatus && (
                    <span
                      role="status"
                      style={{
                        fontSize: "11px",
                        color: cepStatus.includes("encontrado")
                          ? "#267342"
                          : "#777777",
                        fontWeight: 400,
                      }}
                    >
                      {cepStatus}
                    </span>
                  )}
                </label>

                <label className="checkout-field checkout-field-full">
                  Endereço
                  <input
                    type="text"
                    name="street"
                    value={address.street}
                    onChange={handleAddressChange}
                    placeholder="Rua, avenida..."
                    autoComplete="street-address"
                    required
                  />
                </label>

                <label className="checkout-field">
                  Número
                  <input
                    type="text"
                    name="number"
                    value={address.number}
                    onChange={handleAddressChange}
                    placeholder="Número"
                    required
                  />
                </label>

                <label className="checkout-field">
                  Complemento
                  <input
                    type="text"
                    name="complement"
                    value={address.complement}
                    onChange={handleAddressChange}
                    placeholder="Apartamento, bloco..."
                  />
                </label>

                <label className="checkout-field">
                  Bairro
                  <input
                    type="text"
                    name="neighborhood"
                    value={address.neighborhood}
                    onChange={handleAddressChange}
                    placeholder="Seu bairro"
                    required
                  />
                </label>

                <label className="checkout-field">
                  Cidade
                  <input
                    type="text"
                    name="city"
                    value={address.city}
                    onChange={handleAddressChange}
                    placeholder="Sua cidade"
                    autoComplete="address-level2"
                    required
                  />
                </label>

                <label className="checkout-field">
                  Estado
                  <input
                    type="text"
                    name="state"
                    value={address.state}
                    onChange={handleAddressChange}
                    placeholder="UF"
                    autoComplete="address-level1"
                    maxLength={2}
                    required
                  />
                </label>
              </div>
            </section>

            <section className="checkout-section">
              <div className="checkout-section-heading">
                <span>03</span>
                <div>
                  <h2>Forma de entrega</h2>
                  <p>Escolha como deseja receber seu pedido.</p>
                </div>
              </div>

              <div className="checkout-shipping-options">
                {shippingOptions.map((option) => (
                  <label
                    key={option.id}
                    className={`checkout-shipping-option ${
                      selectedShipping === option.id
                        ? "checkout-shipping-option-selected"
                        : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="shipping"
                      value={option.id}
                      checked={selectedShipping === option.id}
                      onChange={() => setSelectedShipping(option.id)}
                    />

                    <span className="checkout-shipping-radio" />

                    <span className="checkout-shipping-icon">
                      <Truck size={22} />
                    </span>

                    <span className="checkout-shipping-info">
                      <strong>{option.name}</strong>
                      <span>{option.description}</span>
                      <small>
                        <Clock3 size={12} />
                        {option.estimatedDays}
                      </small>
                    </span>

                    <strong className="checkout-shipping-price">
                      {currencyFormatter.format(option.price)}
                    </strong>
                  </label>
                ))}
              </div>

              <div className="checkout-shipping-notice">
                <PackageCheck size={16} />
                <p>
                  Valores e prazos ilustrativos. O cálculo real do frete será
                  disponibilizado em uma próxima etapa.
                </p>
              </div>
            </section>

            {showPayment && (
              <section className="checkout-section checkout-payment-section">
                <div className="checkout-section-heading">
                  <span>04</span>
                  <div>
                    <h2>Forma de pagamento</h2>
                    <p>Escolha como deseja pagar seu pedido.</p>
                  </div>
                </div>

                <div className="checkout-payment-options">
                  {paymentOptions.map((option) => {
                    const isSelected = selectedPayment === option.id;

                    return (
                      <label
                        key={option.id}
                        className={`checkout-payment-option ${
                          isSelected
                            ? "checkout-payment-option-selected"
                            : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name="payment"
                          value={option.id}
                          checked={isSelected}
                          onChange={() => setSelectedPayment(option.id)}
                        />

                        <span className="checkout-shipping-radio" />

                        <span className="checkout-payment-icon">
                          {option.id === "pix" && <QrCode size={23} />}
                          {option.id === "card" && <CreditCard size={23} />}
                          {option.id === "boleto" && <Barcode size={23} />}
                        </span>

                        <span className="checkout-payment-info">
                          <strong>{option.name}</strong>
                          <small>{option.description}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className="checkout-payment-notice">
                  <Info size={17} />
                  <div>
                    <strong>
                      {selectedPaymentOption?.name} selecionado
                    </strong>
                    <p>
                      A integração com o sistema de pagamento será
                      disponibilizada em uma próxima etapa. Nenhuma cobrança
                      será realizada agora.
                    </p>
                  </div>
                </div>

                <div className="checkout-payment-security">
                  <ShieldCheck size={18} />
                  <span>Pagamento protegido após a integração oficial.</span>
                </div>

                <button
                  type="button"
                  className="checkout-submit"
                  disabled
                >
                  Pagamento em breve
                </button>
              </section>
            )}

            {!showPayment && (
              <>
                <button type="submit" className="checkout-submit">
                  Continuar para pagamento
                </button>

                <p className="checkout-security">
                  <LockKeyhole size={14} />
                  Seus dados devem ser protegidos durante todo o processo.
                </p>
              </>
            )}
          </form>

          <aside className="checkout-summary">
            <span>SEU PEDIDO</span>
            <h2>Resumo da compra.</h2>

            <div className="checkout-products">
              {items.map((item) => (
                <div className="checkout-product" key={item.id}>
                  <img src={item.image} alt={item.name} />

                  <div>
                    <strong>{item.name}</strong>
                    <span>Quantidade: {item.quantity}</span>
                  </div>

                  <strong>
                    {currencyFormatter.format(item.price * item.quantity)}
                  </strong>
                </div>
              ))}
            </div>

            <div className="checkout-total">
              <span>Subtotal</span>
              <strong>{currencyFormatter.format(subtotal)}</strong>
            </div>

            <div className="checkout-total checkout-shipping-total">
              <span>Entrega ({selectedShippingOption?.name ?? "—"})</span>
              <strong>{currencyFormatter.format(shippingPrice)}</strong>
            </div>

            <div className="checkout-grand-total">
              <span>Total do pedido</span>
              <strong>{currencyFormatter.format(total)}</strong>
            </div>

            <p>
              Frete demonstrativo. O valor definitivo será calculado na
              integração de entrega.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
