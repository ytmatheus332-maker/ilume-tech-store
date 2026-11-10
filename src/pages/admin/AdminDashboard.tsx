import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { X, RefreshCcw } from "lucide-react";

interface ProductSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  brand: string;
}

export default function AdminDashboard() {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductSummary | null>(null);
  const [sku, setSku] = useState("");
  const [color, setColor] = useState("");
  const [priceReais, setPriceReais] = useState("");

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    const { data } = await supabase.from("products").select("id, name, slug, status, brand").order("name");
    setProducts(data || []);
  }

  async function handleOpenVariants(product: ProductSummary) {
    setSelectedProduct(product);
    setSku(`${product.slug.toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`);
  }

  async function handleAddVariant(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProduct) return;
    const priceNum = parseFloat(priceReais.replace(',', '.'));
    await supabase.from("product_variants").insert([{
      product_id: selectedProduct.id,
      sku: sku,
      color: color || "Padrão",
      storage_gb: 128,
      price_cents: Math.round(priceNum * 100),
      availability_status: "available"
    }]);
    setPriceReais("");
    alert("Preço salvo com sucesso!");
  }

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between" }}>
        <h1>ILUME CENTRAL</h1>
        <button onClick={fetchProducts}><RefreshCcw size={16} /></button>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: selectedProduct ? "1fr 400px" : "1fr", gap: "2rem", marginTop: "2rem" }}>
        <div style={{ border: "1px solid #ddd", padding: "1rem" }}>
          <h3>Catálogo</h3>
          {products.map(p => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px", borderBottom: "1px solid #eee" }}>
              {p.name} <button onClick={() => handleOpenVariants(p)}>Gerenciar</button>
            </div>
          ))}
        </div>
        {selectedProduct && (
          <div style={{ border: "2px solid #000", padding: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <h2>{selectedProduct.name}</h2>
              <button onClick={() => setSelectedProduct(null)}><X /></button>
            </div>
            <form onSubmit={handleAddVariant} style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "1rem" }}>
              <input type="text" placeholder="SKU" value={sku} onChange={e => setSku(e.target.value)} required />
              <input type="text" placeholder="Cor" value={color} onChange={e => setColor(e.target.value)} />
              <input type="text" placeholder="Preço (Ex: 5499.00)" value={priceReais} onChange={e => setPriceReais(e.target.value)} required />
              <button type="submit" style={{ padding: "10px", background: "#000", color: "#fff", border: "none" }}>PUBLICAR PREÇO</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}