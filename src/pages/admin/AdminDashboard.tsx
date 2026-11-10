import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { 
  Package, 
  Tag, 
  Plus, 
  Trash2, 
  X,
  LayoutDashboard,
  RefreshCcw,
  Hash,
  ShoppingCart,
  DollarSign,
  Clock,
  CheckCircle,
  AlertTriangle
} from "lucide-react";

interface ProductSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  brand: string;
}

interface Variant {
  id: string;
  product_id: string;
  sku: string;
  color: string | null;
  storage_gb: number | null;
  price_cents: number;
  availability_status: string;
}

interface Order {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  total_amount_cents: number;
  status: string;
  gateway: string;
  created_at: string;
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<"catalog" | "orders">("catalog");

  // Estados do Catálogo
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<ProductSummary | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);

  // Estados de Formulário de Variante
  const [sku, setSku] = useState("");
  const [color, setColor] = useState("");
  const [storageGb, setStorageGb] = useState("128");
  const [priceReais, setPriceReais] = useState("");
  const [availability, setAvailability] = useState("available");
  const [savingVariant, setSavingVariant] = useState(false);

  // Estados de Pedidos
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  useEffect(() => {
    fetchProducts();
    fetchOrders();
  }, []);

  async function fetchProducts() {
    setLoading(true);
    const { data } = await supabase.from("products").select("id, name, slug, status, brand").order("name");
    setProducts(data || []);
    setLoading(false);
  }

  async function fetchOrders() {
    setLoadingOrders(true);
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao carregar pedidos:", error.message);
    } else {
      setOrders(data || []);
    }
    setLoadingOrders(false);
  }

  async function handleOpenVariants(product: ProductSummary) {
    setSelectedProduct(product);
    setLoadingVariants(true);
    setSku(`${product.slug.toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`);
    
    const { data } = await supabase
      .from("product_variants")
      .select("*")
      .eq("product_id", product.id)
      .order("price_cents");

    setVariants(data || []);
    setLoadingVariants(false);
  }

  async function handleAddVariant(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProduct) return;
    
    const priceNum = parseFloat(priceReais.replace(',', '.'));
    if (isNaN(priceNum) || priceNum <= 0) {
      alert("Insira um valor válido.");
      return;
    }

    setSavingVariant(true);
    const { error } = await supabase.from("product_variants").insert([{
      product_id: selectedProduct.id,
      sku: sku.trim(),
      color: color.trim() || "Padrão",
      storage_gb: parseInt(storageGb),
      price_cents: Math.round(priceNum * 100),
      availability_status: availability
    }]);

    if (error) {
      alert("Erro ao salvar: " + error.message);
    } else {
      alert("Preço publicado com sucesso!");
      setColor("");
      setPriceReais("");
      setSku(`${selectedProduct.slug.toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`);
      await handleOpenVariants(selectedProduct);
    }
    setSavingVariant(false);
  }

  async function handleDeleteVariant(id: string) {
    if (!confirm("Remover este preço?")) return;
    const { error } = await supabase.from("product_variants").delete().eq("id", id);
    if (!error) setVariants(variants.filter(v => v.id !== id));
  }

  const formatCurrency = (cents: number) => 
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", color: "#1a1a1a", fontFamily: "'Inter', sans-serif" }}>
      
      {/* NAVBAR */}
      <nav style={{ background: "#000", color: "#fff", padding: "1rem 2rem", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <LayoutDashboard size={20} />
          <span style={{ fontWeight: "800", fontSize: "1.2rem", letterSpacing: "-0.5px" }}>ILUME CENTRAL</span>
        </div>
        <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
          <button 
            onClick={() => { fetchProducts(); fetchOrders(); }} 
            style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", fontSize: "0.8rem" }}
          >
            <RefreshCcw size={14} /> Sincronizar
          </button>
        </div>
      </nav>

      {/* ABAS DE NAVEGAÇÃO INTERNA */}
      <div style={{ background: "#fff", borderBottom: "1px solid #dee2e6", padding: "0 2rem", display: "flex", gap: "2rem" }}>
        <button 
          onClick={() => setActiveTab("catalog")}
          style={{ padding: "1rem 0", background: "none", border: "none", borderBottom: activeTab === "catalog" ? "2px solid #000" : "2px solid transparent", fontWeight: activeTab === "catalog" ? "700" : "400", cursor: "pointer", fontSize: "0.9rem", color: activeTab === "catalog" ? "#000" : "#6c757d", display: "flex", alignItems: "center", gap: "8px" }}
        >
          <Package size={16} /> Gestão de Catálogo & Preços
        </button>
        <button 
          onClick={() => setActiveTab("orders")}
          style={{ padding: "1rem 0", background: "none", border: "none", borderBottom: activeTab === "orders" ? "2px solid #000" : "2px solid transparent", fontWeight: activeTab === "orders" ? "700" : "400", cursor: "pointer", fontSize: "0.9rem", color: activeTab === "orders" ? "#000" : "#6c757d", display: "flex", alignItems: "center", gap: "8px" }}
        >
          <ShoppingCart size={16} /> Pedidos & Pagamentos ({orders.length})
        </button>
      </div>

      <main style={{ padding: "2rem", maxWidth: "1400px", margin: "0 auto" }}>
        
        {/* ABA 1: CATÁLOGO */}
        {activeTab === "catalog" && (
          <div>
            <header style={{ marginBottom: "2rem" }}>
              <h1 style={{ fontSize: "1.8rem", fontWeight: "800" }}>Catálogo e Preços</h1>
              <p style={{ color: "#6c757d" }}>Gerencie os produtos da vitrine e defina os valores de venda.</p>
            </header>

            <div style={{ display: "grid", gridTemplateColumns: selectedProduct ? "1fr 480px" : "1fr", gap: "2rem" }}>
              <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e9ecef", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", fontSize: "0.7rem", color: "#adb5bd", textTransform: "uppercase", background: "#fcfcfc" }}>
                      <th style={{ padding: "1rem" }}>Aparelho</th>
                      <th style={{ padding: "1rem" }}>Status</th>
                      <th style={{ padding: "1rem", textAlign: "right" }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(p => (
                      <tr key={p.id} style={{ borderBottom: "1px solid #f8f9fa", background: selectedProduct?.id === p.id ? "#f1f5f9" : "transparent" }}>
                        <td style={{ padding: "1rem" }}>
                          <div style={{ fontWeight: "700" }}>{p.name}</div>
                          <div style={{ fontSize: "0.75rem", color: "#6c757d" }}>{p.brand}</div>
                        </td>
                        <td style={{ padding: "1rem" }}>
                          <span style={{ fontSize: "0.65rem", fontWeight: "800", padding: "4px 10px", borderRadius: "20px", background: p.status === 'published' ? "#d1e7dd" : "#eee", color: p.status === 'published' ? "#0f5132" : "#333" }}>
                            {p.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: "1rem", textAlign: "right" }}>
                          <button onClick={() => handleOpenVariants(p)} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #000", background: selectedProduct?.id === p.id ? "#000" : "#fff", color: selectedProduct?.id === p.id ? "#fff" : "#000", cursor: "pointer", fontWeight: "700", fontSize: "0.8rem" }}>
                            {selectedProduct?.id === p.id ? "Editando..." : "Gerenciar Preços"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedProduct && (
                <div style={{ background: "#fff", borderRadius: "12px", border: "2px solid #000", padding: "2rem", position: "sticky", top: "120px", height: "fit-content" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.5rem" }}>
                    <h2 style={{ fontSize: "1.2rem", fontWeight: "800", margin: 0 }}>{selectedProduct.name}</h2>
                    <button onClick={() => setSelectedProduct(null)} style={{ background: "#f8f9fa", border: "none", borderRadius: "50%", width: "32px", height: "32px", cursor: "pointer" }}><X size={18} /></button>
                  </div>

                  <div style={{ marginBottom: "2rem" }}>
                    <h4 style={{ fontSize: "0.7rem", color: "#999", textTransform: "uppercase", marginBottom: "1rem" }}>Preços Ativos</h4>
                    {variants.length === 0 ? <p style={{ fontSize: "0.8rem", color: "#adb5bd" }}>Sem preço definido.</p> : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {variants.map(v => (
                          <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.8rem", borderRadius: "8px", background: "#f8f9fa", border: "1px solid #e9ecef" }}>
                            <div>
                              <div style={{ fontSize: "0.75rem", fontWeight: "700" }}>{v.sku}</div>
                              <div style={{ fontSize: "0.7rem", color: "#6c757d" }}>{v.color} • {v.storage_gb}GB</div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <span style={{ fontWeight: "800", color: "#198754", fontSize: "0.9rem" }}>{formatCurrency(v.price_cents)}</span>
                              <button onClick={() => handleDeleteVariant(v.id)} style={{ background: "none", border: "none", color: "#dc3545", cursor: "pointer" }}><Trash2 size={14} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleAddVariant} style={{ borderTop: "1px solid #eee", paddingTop: "1.5rem", display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div>
                      <label style={labelStyle}>SKU</label>
                      <input type="text" value={sku} onChange={e => setSku(e.target.value)} style={inputStyle} required />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div>
                        <label style={labelStyle}>Cor</label>
                        <input type="text" placeholder="Ex: Preto" value={color} onChange={e => setColor(e.target.value)} style={inputStyle} required />
                      </div>
                      <div>
                        <label style={labelStyle}>GB</label>
                        <input type="number" value={storageGb} onChange={e => setStorageGb(e.target.value)} style={inputStyle} required />
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Preço (R$)</label>
                      <input type="text" placeholder="0.00" value={priceReais} onChange={e => setPriceReais(e.target.value)} style={{ ...inputStyle, fontWeight: "800", fontSize: "1.1rem" }} required />
                    </div>
                    <button type="submit" disabled={savingVariant} style={{ padding: "1rem", background: "#000", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "800", cursor: "pointer" }}>
                      {savingVariant ? "Salvando..." : "Adicionar Preço"}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABA 2: PEDIDOS & PAGAMENTOS */}
        {activeTab === "orders" && (
          <div>
            <header style={{ marginBottom: "2rem" }}>
              <h1 style={{ fontSize: "1.8rem", fontWeight: "800" }}>Pedidos & Fluxo de Caixa</h1>
              <p style={{ color: "#6c757d" }}>Acompanhe as vendas realizadas e o status dos pagamentos via Gateway.</p>
            </header>

            <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e9ecef", overflow: "hidden" }}>
              {loadingOrders ? (
                <p style={{ padding: "2rem" }}>Carregando pedidos...</p>
              ) : orders.length === 0 ? (
                <div style={{ padding: "4rem", textAlign: "center", color: "#adb5bd" }}>
                  <ShoppingCart size={32} style={{ marginBottom: "10px" }} />
                  <p>Nenhum pedido registrado no sistema ainda.</p>
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", fontSize: "0.7rem", color: "#adb5bd", textTransform: "uppercase", background: "#fcfcfc" }}>
                      <th style={{ padding: "1rem" }}>ID / Data</th>
                      <th style={{ padding: "1rem" }}>Cliente</th>
                      <th style={{ padding: "1rem" }}>Gateway</th>
                      <th style={{ padding: "1rem" }}>Total</th>
                      <th style={{ padding: "1rem" }}>Status Pagamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id} style={{ borderBottom: "1px solid #f8f9fa" }}>
                        <td style={{ padding: "1rem" }}>
                          <div style={{ fontWeight: "700", fontSize: "0.85rem" }}>#{o.id.slice(0, 8)}</div>
                          <div style={{ fontSize: "0.7rem", color: "#6c757d" }}>{new Date(o.created_at).toLocaleString("pt-BR")}</div>
                        </td>
                        <td style={{ padding: "1rem" }}>
                          <div style={{ fontWeight: "600", fontSize: "0.9rem" }}>{o.customer_name}</div>
                          <div style={{ fontSize: "0.75rem", color: "#6c757d" }}>{o.customer_email}</div>
                        </td>
                        <td style={{ padding: "1rem", fontSize: "0.85rem", textTransform: "uppercase", fontWeight: "600", color: "#495057" }}>
                          {o.gateway}
                        </td>
                        <td style={{ padding: "1rem", fontWeight: "800", color: "#198754" }}>
                          {formatCurrency(o.total_amount_cents)}
                        </td>
                        <td style={{ padding: "1rem" }}>
                          <span style={{ 
                            fontSize: "0.65rem", fontWeight: "800", padding: "4px 10px", borderRadius: "20px", 
                            background: o.status === 'approved' ? "#d1e7dd" : o.status === 'pending' ? "#fff3cd" : "#f8d7da",
                            color: o.status === 'approved' ? "#0f5132" : o.status === 'pending' ? "#664d03" : "#842029"
                          }}>
                            {o.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

const labelStyle = { fontSize: "0.65rem", fontWeight: "800", color: "#adb5bd", textTransform: "uppercase" as const, marginBottom: "4px", display: "block" };
const inputStyle = { width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #dee2e6", fontSize: "0.85rem", background: "#fff" };