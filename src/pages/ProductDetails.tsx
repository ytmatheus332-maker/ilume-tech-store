import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ShoppingBag,
  ArrowLeft,
  ShieldCheck,
  Truck,
  Check,
} from "lucide-react";

import { useCart } from "../context/CartContext";
import { getPublishedProducts } from "../services/catalog";
import type { CatalogProduct } from "../types/catalog";
import "./ProductDetails.css";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const editorialImages: Record<string, string> = {
  "iphone-15": "/images/iphone-15.jpeg",
  "iphone-16": "/images/iphone-16.jpeg",
  "iphone-16-pro": "/images/iphone-16-pro.jpg",
};

// DADOS COMPLEMENTARES DE ESPECIFICAÇÕES PARA A PÁGINA DE DETALHES
const productSpecsData: Record<string, { highlights: string[]; specs: { category: string; label: string; value: string }[] }> = {
  "iphone-15": {
    highlights: [
      "Tela Super Retina XDR OLED de 6,1 polegadas.",
      "Chip A16 Bionic para desempenho e eficiência.",
      "Câmera principal de 48 MP com alta resolução.",
      "Dynamic Island para acompanhar atividades em tempo real.",
      "Conexão USB-C universal.",
      "Resistência IP68 contra água e poeira."
    ],
    specs: [
      { category: "Tela", label: "Tecnologia", value: "Super Retina XDR OLED" },
      { category: "Tela", label: "Tamanho", value: "6,1 polegadas" },
      { category: "Desempenho", label: "Processador", value: "Apple A16 Bionic" },
      { category: "Câmeras", label: "Principal", value: "48 MP" },
      { category: "Conectividade", label: "Porta", value: "USB-C" },
    ]
  },
  "iphone-16": {
    highlights: [
      "Tela Super Retina XDR OLED de 6,1 polegadas.",
      "Chip Apple A18 de última geração.",
      "Sistema de câmera Fusion de 48 MP.",
      "Controle da Câmera para capturas rápidas.",
      "Compatível com Apple Intelligence.",
      "Conexão USB-C e corpo em alumínio aeroespacial."
    ],
    specs: [
      { category: "Tela", label: "Tecnologia", value: "Super Retina XDR OLED" },
      { category: "Tela", label: "Tamanho", value: "6,1 polegadas" },
      { category: "Desempenho", label: "Processador", value: "Apple A18" },
      { category: "Câmeras", label: "Principal Fusion", value: "48 MP" },
      { category: "Conectividade", label: "Porta", value: "USB-C" },
    ]
  },
  "iphone-16-pro": {
    highlights: [
      "Tela Super Retina XDR OLED de 6,3 polegadas.",
      "Tecnologia ProMotion de até 120 Hz.",
      "Chip Apple A18 Pro com desempenho profissional.",
      "Sistema de câmera Pro com principal de 48 MP e Ultra-angular.",
      "Teleobjetiva de 5x para zoom de alta precisão.",
      "Acabamento premium em titânio leve e resistente."
    ],
    specs: [
      { category: "Tela", label: "Tecnologia", value: "Super Retina XDR OLED ProMotion" },
      { category: "Tela", label: "Tamanho", value: "6,3 polegadas" },
      { category: "Desempenho", label: "Processador", value: "Apple A18 Pro" },
      { category: "Câmeras", label: "Sistema Pro", value: "48 MP Principal + Ultra-angular + Teleobjetiva 5x" },
      { category: "Construção", label: "Material", value: "Titânio aeroespacial" },
    ]
  }
};

export default function ProductDetails() {
  const { slug } = useParams<{ slug: string }>();
  const { addToCart } = useCart();

  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    async function loadProduct() {
      try {
        setLoading(true);
        const products = await getPublishedProducts();
        const found = products.find((item) => item.slug === slug);
        setProduct(found || null);
      } catch (err) {
        console.error("Erro ao carregar detalhes:", err);
      } finally {
        setLoading(false);
      }
    }

    loadProduct();
  }, [slug]);

  if (loading) {
    return (
      <main style={{ padding: "8rem 2rem", textAlign: "center", fontFamily: "'Inter', sans-serif" }}>
        <span style={{ fontSize: "0.75rem", letterSpacing: "1.5px", color: "#888" }}>ILUME TECH STORE</span>
        <h2 style={{ fontWeight: "500", marginTop: "1rem" }}>Carregando produto...</h2>
      </main>
    );
  }

  if (!product) {
    return (
      <main style={{ padding: "8rem 2rem", textAlign: "center", fontFamily: "'Inter', sans-serif" }}>
        <span style={{ fontSize: "0.75rem", letterSpacing: "1.5px", color: "#888" }}>ILUME TECH STORE</span>
        <h1 style={{ fontSize: "2rem", fontWeight: "700", margin: "1rem 0" }}>Produto não encontrado.</h1>
        <Link to="/" style={{ color: "#171717", fontWeight: "600", textDecoration: "underline" }}>Voltar para a loja</Link>
      </main>
    );
  }

  const availableVariant = product.variants.find(
    (v) => v.availability_status === "available" || v.availability_status === "preorder"
  );
  const priceCents = availableVariant ? availableVariant.price_cents : 0;
  const priceReais = priceCents / 100;

  const primaryImg = product.images[0]?.storage_path;
  const productImage = (primaryImg && /^https?:\/\//i.test(primaryImg)) 
    ? primaryImg 
    : (editorialImages[product.slug] || "/images/product-placeholder.png");

  const extraData = productSpecsData[product.slug] || {
    highlights: ["Design sofisticado e tecnologia de ponta.", "Desempenho otimizado para o dia a dia."],
    specs: [{ category: "Geral", label: "Marca", value: product.brand || "Apple" }]
  };

  const handleAddToCart = () => {
    addToCart({
      id: product.id,
      variantId: availableVariant?.id || product.id,
      name: product.name,
      price: priceReais,
      quantity: quantity,
      image: productImage,
      color: availableVariant?.color || "Padrão",
      storage: availableVariant?.storage_gb || 128,
    });

    setAdded(true);
    setTimeout(() => setAdded(false), 2500);
  };

  return (
    <main style={{ padding: "3rem 2rem", maxWidth: "1100px", margin: "0 auto", fontFamily: "'Inter', sans-serif", color: "#171717" }}>
      <Link to="/" style={{ display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none", color: "#666", fontSize: "0.85rem", fontWeight: "500", marginBottom: "3rem" }}>
        <ArrowLeft size={14} /> Voltar para a loja
      </Link>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "4rem", alignItems: "center", marginBottom: "5rem" }}>
        
        {/* IMAGEM */}
        <div style={{ background: "#f8f9fa", borderRadius: "12px", border: "1px solid #eee", padding: "4rem", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "450px", position: "relative" }}>
          <span style={{ position: "absolute", top: "1.5rem", left: "1.5rem", fontSize: "0.7rem", letterSpacing: "1.5px", color: "#888", textTransform: "uppercase" }}>ILUME AUTHENTIC</span>
          <img
            src={productImage}
            alt={product.name}
            style={{ maxWidth: "100%", maxHeight: "350px", objectFit: "contain" }}
          />
        </div>

        {/* INFO E COMPRA */}
        <div>
          <span style={{ fontSize: "0.75rem", letterSpacing: "1.5px", color: "#888", textTransform: "uppercase", display: "block", marginBottom: "0.5rem" }}>CURADORIA ILUME</span>
          
          <h1 style={{ fontSize: "2.5rem", fontWeight: "800", letterSpacing: "-1px", marginBottom: "1rem" }}>{product.name}</h1>

          <p style={{ color: "#555", fontSize: "1rem", lineHeight: "1.6", marginBottom: "2rem" }}>
            {product.short_description || product.description || "Tecnologia refinada, sem excessos."}
          </p>

          <div style={{ fontSize: "2rem", fontWeight: "700", letterSpacing: "-0.5px", color: "#171717", marginBottom: "2rem" }}>
            {priceReais > 0 ? currencyFormatter.format(priceReais) : <span style={{ fontSize: "1.2rem", color: "#999" }}>Indisponível no momento</span>}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", marginBottom: "2rem" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: "600", color: "#444" }}>Quantidade</span>
            <div style={{ display: "flex", alignItems: "center", border: "1px solid #ddd", borderRadius: "6px", background: "#fff" }}>
              <button onClick={() => setQuantity((c) => Math.max(1, c - 1))} style={{ background: "none", border: "none", padding: "8px 14px", cursor: "pointer", fontSize: "1rem" }}>−</button>
              <strong style={{ padding: "0 10px", fontSize: "0.95rem" }}>{quantity}</strong>
              <button onClick={() => setQuantity((c) => c + 1)} style={{ background: "none", border: "none", padding: "8px 14px", cursor: "pointer", fontSize: "1rem" }}>+</button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddToCart}
            disabled={priceReais === 0}
            style={{
              width: "100%",
              padding: "1.1rem",
              background: added ? "#166534" : "#171717",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontWeight: "600",
              fontSize: "0.95rem",
              cursor: priceReais === 0 ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              opacity: priceReais === 0 ? 0.5 : 1,
            }}
          >
            {added ? <Check size={18} /> : <ShoppingBag size={18} />}
            {added ? "Adicionado à sacola" : "Adicionar à sacola"}
          </button>

          <div style={{ display: "flex", gap: "2rem", marginTop: "2.5rem", borderTop: "1px solid #eee", paddingTop: "1.5rem", color: "#666", fontSize: "0.85rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><ShieldCheck size={16} /> Compra segura</div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><Truck size={16} /> Envio garantido</div>
          </div>
        </div>

      </div>

      {/* SEÇÃO DE DESTAQUES E DETALHES */}
      <section style={{ borderTop: "1px solid #eaeaea", padding: "4rem 0" }}>
        <span style={{ fontSize: "0.75rem", letterSpacing: "1.5px", color: "#888", textTransform: "uppercase" }}>DIFERENCIAIS</span>
        <h2 style={{ fontSize: "1.8rem", fontWeight: "700", margin: "0.5rem 0 2rem 0" }}>Feito para ir além.</h2>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem", marginBottom: "4rem" }}>
          {extraData.highlights.map((h, i) => (
            <div key={i} style={{ background: "#f8f9fa", padding: "1.5rem", borderRadius: "8px", border: "1px solid #eee" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: "700", color: "#999", display: "block", marginBottom: "0.5rem" }}>{String(i + 1).padStart(2, "0")}</span>
              <p style={{ fontSize: "0.95rem", color: "#333", lineHeight: "1.5" }}>{h}</p>
            </div>
          ))}
        </div>

        <span style={{ fontSize: "0.75rem", letterSpacing: "1.5px", color: "#888", textTransform: "uppercase" }}>ESPECIFICAÇÕES TÉCNICAS</span>
        <h2 style={{ fontSize: "1.8rem", fontWeight: "700", margin: "0.5rem 0 2rem 0" }}>Ficha técnica.</h2>
        
        <div style={{ border: "1px solid #eee", borderRadius: "8px", overflow: "hidden" }}>
          {extraData.specs.map((s, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "1rem 1.5rem", borderBottom: i < extraData.specs.length - 1 ? "1px solid #eee" : "none", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
              <span style={{ color: "#666", fontSize: "0.9rem" }}>{s.label} ({s.category})</span>
              <strong style={{ fontSize: "0.9rem", color: "#171717" }}>{s.value}</strong>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}