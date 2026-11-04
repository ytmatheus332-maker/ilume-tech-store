
import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ShoppingBag,
  ArrowLeft,
  ShieldCheck,
  Truck,
  Check,
} from "lucide-react";

import { useCart } from "../context/CartContext";
import "./ProductDetails.css";

interface Specification {
  category: string;
  details: {
    label: string;
    value: string;
  }[];
}

interface Product {
  id: number;
  slug: string;
  name: string;
  description: string;
  longDescription: string;
  price: number;
  image: string;
  label: string;
  highlights: string[];
  specifications: Specification[];
}

const products: Product[] = [
  {
    id: 1,
    slug: "iphone-15",
    name: "iPhone 15",
    description: "Design sofisticado. Desempenho avançado.",
    longDescription:
      "O iPhone 15 combina um design elegante com recursos avançados para o dia a dia. Sua tela Super Retina XDR, o chip A16 Bionic e o sistema de câmera dupla de 48 MP oferecem uma experiência completa para fotografias, vídeos, entretenimento e produtividade.",
    price: 4499,
    image: "/images/iphone-15.jpeg",
    label: "DESTAQUE",
    highlights: [
      "Tela Super Retina XDR OLED de 6,1 polegadas.",
      "Chip A16 Bionic para desempenho e eficiência.",
      "Câmera principal de 48 MP.",
      "Dynamic Island para acompanhar atividades.",
      "Conexão USB-C.",
      "Resistência IP68 contra água e poeira.",
    ],
    specifications: [
      {
        category: "Tela",
        details: [
          { label: "Tecnologia", value: "Super Retina XDR OLED" },
          { label: "Tamanho", value: "6,1 polegadas" },
          { label: "Resolução", value: "2556 x 1179 pixels" },
          { label: "Recursos", value: "Dynamic Island e HDR" },
        ],
      },
      {
        category: "Desempenho",
        details: [
          { label: "Processador", value: "Apple A16 Bionic" },
          { label: "CPU", value: "6 núcleos" },
          { label: "GPU", value: "5 núcleos" },
          { label: "Neural Engine", value: "16 núcleos" },
        ],
      },
      {
        category: "Câmeras",
        details: [
          { label: "Principal", value: "48 MP" },
          { label: "Ultra-angular", value: "12 MP" },
          { label: "Frontal", value: "12 MP" },
          { label: "Vídeo", value: "4K Dolby Vision" },
        ],
      },
      {
        category: "Construção e conexões",
        details: [
          { label: "Conector", value: "USB-C" },
          { label: "Conectividade", value: "5G, Wi-Fi 6 e Bluetooth 5.3" },
          { label: "Resistência", value: "IP68" },
          { label: "Estrutura", value: "Alumínio e Ceramic Shield" },
        ],
      },
    ],
  },
  {
    id: 2,
    slug: "iphone-16",
    name: "iPhone 16",
    description: "Uma nova experiência em tecnologia.",
    longDescription:
      "O iPhone 16 reúne potência, versatilidade e recursos inteligentes em um design moderno. Equipado com o chip A18, oferece excelente desempenho, enquanto o sistema de câmera Fusion de 48 MP e a tela Super Retina XDR tornam a experiência ainda mais completa.",
    price: 5499,
    image: "/images/iphone-16.jpeg",
    label: "POPULAR",
    highlights: [
      "Tela Super Retina XDR OLED de 6,1 polegadas.",
      "Chip Apple A18.",
      "Sistema de câmera Fusion de 48 MP.",
      "Controle da Câmera para facilitar registros.",
      "Compatibilidade com Apple Intelligence.",
      "Conexão USB-C e resistência IP68.",
    ],
    specifications: [
      {
        category: "Tela",
        details: [
          { label: "Tecnologia", value: "Super Retina XDR OLED" },
          { label: "Tamanho", value: "6,1 polegadas" },
          { label: "Resolução", value: "2556 x 1179 pixels" },
          { label: "Recursos", value: "Dynamic Island e HDR" },
        ],
      },
      {
        category: "Desempenho",
        details: [
          { label: "Processador", value: "Apple A18" },
          { label: "CPU", value: "6 núcleos" },
          { label: "GPU", value: "5 núcleos" },
          { label: "Neural Engine", value: "16 núcleos" },
        ],
      },
      {
        category: "Câmeras",
        details: [
          { label: "Principal Fusion", value: "48 MP" },
          { label: "Ultra-angular", value: "12 MP" },
          { label: "Frontal", value: "12 MP" },
          { label: "Vídeo", value: "4K Dolby Vision" },
        ],
      },
      {
        category: "Construção e conexões",
        details: [
          { label: "Conector", value: "USB-C" },
          { label: "Conectividade", value: "5G, Wi-Fi 7 e Bluetooth 5.3" },
          { label: "Resistência", value: "IP68" },
          { label: "Estrutura", value: "Alumínio e Ceramic Shield" },
        ],
      },
    ],
  },
  {
    id: 3,
    slug: "iphone-16-pro",
    name: "iPhone 16 Pro",
    description: "Potência e precisão em cada detalhe.",
    longDescription:
      "O iPhone 16 Pro foi desenvolvido para quem busca recursos avançados e alto desempenho. Seu acabamento em titânio, a tela com tecnologia ProMotion de até 120 Hz e o chip A18 Pro se unem a um sistema de câmeras Pro versátil, preparado para fotografia e produção de vídeos em alto nível.",
    price: 7499,
    image: "/images/iphone-16-pro.jpg",
    label: "PREMIUM",
    highlights: [
      "Tela Super Retina XDR OLED de 6,3 polegadas.",
      "Tecnologia ProMotion de até 120 Hz.",
      "Chip Apple A18 Pro.",
      "Sistema de câmera Pro com principal de 48 MP.",
      "Ultra-angular de 48 MP e teleobjetiva de 5x.",
      "Acabamento em titânio e conexão USB-C.",
    ],
    specifications: [
      {
        category: "Tela",
        details: [
          { label: "Tecnologia", value: "Super Retina XDR OLED" },
          { label: "Tamanho", value: "6,3 polegadas" },
          { label: "Resolução", value: "2622 x 1206 pixels" },
          { label: "Atualização", value: "ProMotion até 120 Hz" },
          { label: "Recursos", value: "Dynamic Island e Tela Sempre Ativa" },
        ],
      },
      {
        category: "Desempenho",
        details: [
          { label: "Processador", value: "Apple A18 Pro" },
          { label: "CPU", value: "6 núcleos" },
          { label: "GPU", value: "6 núcleos" },
          { label: "Neural Engine", value: "16 núcleos" },
        ],
      },
      {
        category: "Câmeras",
        details: [
          { label: "Principal Fusion", value: "48 MP" },
          { label: "Ultra-angular", value: "48 MP" },
          { label: "Teleobjetiva", value: "12 MP com zoom óptico de 5x" },
          { label: "Frontal", value: "12 MP" },
          { label: "Vídeo", value: "4K Dolby Vision" },
        ],
      },
      {
        category: "Construção e conexões",
        details: [
          { label: "Conector", value: "USB-C com USB 3" },
          { label: "Conectividade", value: "5G, Wi-Fi 7 e Bluetooth 5.3" },
          { label: "Resistência", value: "IP68" },
          { label: "Estrutura", value: "Titânio e Ceramic Shield" },
        ],
      },
    ],
  },
];

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default function ProductDetails() {
  const { slug } = useParams<{ slug: string }>();
  const { addToCart } = useCart();

  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const product = products.find((item) => item.slug === slug);

  if (product === undefined) {
    return (
      <main className="product-not-found">
        <span>ILUME TECH STORE</span>
        <h1>Produto não encontrado.</h1>

        <Link to="/" className="product-back-link">
          Voltar para a loja
        </Link>
      </main>
    );
  }

  const selectedProduct = product;

  const handleAddToCart = () => {
    addToCart(
      {
        id: selectedProduct.id,
        slug: selectedProduct.slug,
        name: selectedProduct.name,
        price: selectedProduct.price,
        image: selectedProduct.image,
      },
      quantity
    );

    setAdded(true);
  };

  return (
    <main className="product-details">
      <Link to="/" className="product-back-link">
        <ArrowLeft size={16} />
        Voltar para a loja
      </Link>

      <section className="product-details-layout">
        <div className="product-details-image">
          <span>{selectedProduct.label}</span>

          <img
            src={selectedProduct.image}
            alt={selectedProduct.name}
          />
        </div>

        <div className="product-details-info">
          <span className="product-details-label">
            ILUME SELECTION
          </span>

          <h1>{selectedProduct.name}</h1>

          <p className="product-details-description">
            {selectedProduct.description}
          </p>

          <strong className="product-details-price">
            {currencyFormatter.format(selectedProduct.price)}
          </strong>

          <p className="product-details-installment">
            Consulte as condições de pagamento disponíveis.
          </p>

          <div className="product-quantity">
            <span>Quantidade</span>

            <div>
              <button
                type="button"
                onClick={() =>
                  setQuantity((current) => Math.max(1, current - 1))
                }
                aria-label="Diminuir quantidade"
              >
                −
              </button>

              <strong>{quantity}</strong>

              <button
                type="button"
                onClick={() =>
                  setQuantity((current) => current + 1)
                }
                aria-label="Aumentar quantidade"
              >
                +
              </button>
            </div>
          </div>

          <button
            type="button"
            className="product-add-cart"
            onClick={handleAddToCart}
          >
            {added ? <Check size={18} /> : <ShoppingBag size={18} />}

            {added
              ? "Adicionado ao carrinho"
              : "Adicionar ao carrinho"}
          </button>

          <div className="product-benefits">
            <div>
              <ShieldCheck size={19} />
              <span>Compra segura</span>
            </div>

            <div>
              <Truck size={19} />
              <span>Informações de entrega</span>
            </div>
          </div>
        </div>
      </section>

      {/* APRESENTAÇÃO DO PRODUTO */}

      <section className="product-overview">
        <span className="product-section-label">CONHEÇA EM DETALHES</span>

        <h2>Sobre o {selectedProduct.name}.</h2>

        <p>{selectedProduct.longDescription}</p>
      </section>

      {/* DESTAQUES */}

      <section className="product-highlights">
        <div className="product-section-heading">
          <span className="product-section-label">DIFERENCIAIS</span>
          <h2>Feito para ir além.</h2>
        </div>

        <div className="product-highlights-grid">
          {selectedProduct.highlights.map((highlight, index) => (
            <div className="product-highlight-card" key={index}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{highlight}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FICHA TÉCNICA */}

      <section className="product-specifications">
        <div className="product-section-heading">
          <span className="product-section-label">INFORMAÇÕES TÉCNICAS</span>
          <h2>Ficha técnica.</h2>
          <p>Conheça os principais detalhes do aparelho.</p>
        </div>

        <div className="product-specifications-list">
          {selectedProduct.specifications.map((section) => (
            <div
              className="product-specification-group"
              key={section.category}
            >
              <h3>{section.category}</h3>

              <div>
                {section.details.map((detail) => (
                  <div
                    className="product-specification-row"
                    key={detail.label}
                  >
                    <span>{detail.label}</span>
                    <strong>{detail.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
