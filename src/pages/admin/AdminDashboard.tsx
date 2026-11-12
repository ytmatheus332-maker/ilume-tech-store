
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ChangeEvent,
} from "react";

import { supabase } from "../../lib/supabase";
import "./AdminDashboard.css";

import {
  X,
  RefreshCcw,
  Plus,
  Package,
  CheckCircle,
  ImagePlus,
  Star,
  Trash2,
  Tag,
  Save,
  Search,
  Smartphone,
  LayoutDashboard,
  ChevronRight,
  Eye,
  Archive,
  Layers,
  Upload,
  CircleDollarSign,
  ExternalLink,
} from "lucide-react";

type CampaignType = "promotion" | "black_friday" | null;

interface ProductSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  brand: string | null;
  is_featured: boolean;
  campaign_type: CampaignType;
  badge_label: string | null;
}

interface VariantSummary {
  id: string;
  sku: string;
  color: string | null;
  storage_gb: number | null;
  price_cents: number | null;
  availability_status: string;
  is_active: boolean;
}

interface ProductImageSummary {
  id: string;
  storage_path: string;
  alt_text: string | null;
  position: number;
  is_primary: boolean;
}

const NEW_IPHONE_MODELS = [
  "iPhone 14",
  "iPhone 14 Plus",
  "iPhone 14 Pro",
  "iPhone 14 Pro Max",
  "iPhone 15 Plus",
  "iPhone 15 Pro",
  "iPhone 15 Pro Max",
  "iPhone 16 Plus",
  "iPhone 16 Pro Max",
  "iPhone 17",
  "iPhone 17 Pro",
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatPrice(value: number | null) {
  if (value === null) return "Não definido";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100);
}

export default function AdminDashboard() {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [variants, setVariants] = useState<VariantSummary[]>([]);
  const [images, setImages] = useState<ProductImageSummary[]>([]);

  const [selectedProduct, setSelectedProduct] =
    useState<ProductSummary | null>(null);

  const [sku, setSku] = useState("");
  const [color, setColor] = useState("");
  const [storage, setStorage] = useState("128");
  const [priceReais, setPriceReais] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const publishedCount = useMemo(
    () => products.filter((product) => product.status === "published").length,
    [products]
  );

  const draftCount = useMemo(
    () => products.filter((product) => product.status !== "published").length,
    [products]
  );

  const featuredCount = useMemo(
    () => products.filter((product) => product.is_featured).length,
    [products]
  );

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) return products;

    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(term) ||
        product.slug.toLowerCase().includes(term)
    );
  }, [products, searchTerm]);

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, slug, status, brand, is_featured, campaign_type, badge_label"
        )
        .order("name");

      if (error) throw error;

      setProducts((data || []) as ProductSummary[]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";

      alert("Erro ao carregar catálogo: " + message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchVariants(productId: string) {
    const { data, error } = await supabase
      .from("product_variants")
      .select(
        "id, sku, color, storage_gb, price_cents, availability_status, is_active"
      )
      .eq("product_id", productId)
      .order("storage_gb");

    if (error) {
      alert("Erro ao carregar variantes: " + error.message);
      return;
    }

    setVariants(data || []);
  }

  async function fetchImages(productId: string) {
    const { data, error } = await supabase
      .from("product_images")
      .select("id, storage_path, alt_text, position, is_primary")
      .eq("product_id", productId)
      .order("position");

    if (error) {
      alert("Erro ao carregar imagens: " + error.message);
      return;
    }

    setImages(data || []);
  }

  async function handleCreateModels() {
    if (
      !window.confirm(
        "Cadastrar os 11 modelos de iPhone que ainda não existem no catálogo?"
      )
    ) {
      return;
    }

    setSaving(true);

    try {
      const { data: category, error: categoryError } = await supabase
        .from("categories")
        .select("id")
        .eq("slug", "iphones")
        .single();

      if (categoryError) throw categoryError;

      const slugs = NEW_IPHONE_MODELS.map(slugify);

      const { data: existing, error: existingError } = await supabase
        .from("products")
        .select("slug")
        .in("slug", slugs);

      if (existingError) throw existingError;

      const existingSlugs = new Set(
        (existing || []).map((product) => product.slug)
      );

      const missingModels = NEW_IPHONE_MODELS.filter(
        (name) => !existingSlugs.has(slugify(name))
      );

      if (missingModels.length === 0) {
        alert("Todos os modelos já estão cadastrados.");
        return;
      }

      const newProducts = missingModels.map((name) => ({
        category_id: category.id,
        name,
        slug: slugify(name),
        brand: "Apple",
        model: name,
        status: "draft",
      }));

      const { error: insertError } = await supabase
        .from("products")
        .insert(newProducts);

      if (insertError) throw insertError;

      alert(`${missingModels.length} modelos cadastrados como rascunho.`);

      await fetchProducts();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";

      alert("Não foi possível cadastrar os modelos: " + message);
    } finally {
      setSaving(false);
    }
  }

  async function handleOpenVariants(product: ProductSummary) {
    setSelectedProduct(product);
    setColor("");
    setStorage("128");
    setPriceReais("");

    setSku(
      `${product.slug.toUpperCase()}-${Date.now().toString().slice(-6)}`
    );

    await Promise.all([
      fetchVariants(product.id),
      fetchImages(product.id),
    ]);
  }

  function handleCampaignChange(
    field: "is_featured" | "campaign_type" | "badge_label",
    value: boolean | CampaignType | string
  ) {
    if (!selectedProduct) return;

    setSelectedProduct({
      ...selectedProduct,
      [field]: value,
    });
  }

  async function handleSaveCampaign() {
    if (!selectedProduct) return;

    setSaving(true);

    try {
      const { error } = await supabase
        .from("products")
        .update({
          is_featured: selectedProduct.is_featured,
          campaign_type: selectedProduct.campaign_type,
          badge_label: selectedProduct.badge_label?.trim() || null,
        })
        .eq("id", selectedProduct.id);

      if (error) throw error;

      alert("Personalização do produto salva com sucesso!");

      await fetchProducts();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";

      alert("Erro ao salvar personalização: " + message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedProduct) return;

    const priceNum = Number(priceReais.replace(",", "."));
    const storageNum = Number(storage);

    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      alert("Informe um preço válido.");
      return;
    }

    if (!Number.isInteger(storageNum) || storageNum <= 0) {
      alert("Informe uma capacidade válida.");
      return;
    }

    if (!sku.trim()) {
      alert("Informe o SKU.");
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.from("product_variants").insert({
        product_id: selectedProduct.id,
        sku: sku.trim(),
        color: color.trim() || "Padrão",
        storage_gb: storageNum,
        price_cents: Math.round(priceNum * 100),
        availability_status: "available",
        is_active: true,
        fulfillment_type: "supplier_direct",
      });

      if (error) throw error;

      alert("Variante e preço cadastrados com sucesso!");

      setPriceReais("");
      setColor("");

      setSku(
        `${selectedProduct.slug.toUpperCase()}-${Date.now()
          .toString()
          .slice(-6)}`
      );

      await fetchVariants(selectedProduct.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";

      alert("Erro ao cadastrar variante: " + message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleVariant(variant: VariantSummary) {
    if (!selectedProduct) return;

    if (!variant.is_active && variant.price_cents === null) {
      alert("Defina um preço antes de ativar esta variante.");
      return;
    }

    const newStatus = !variant.is_active;

    const { error } = await supabase
      .from("product_variants")
      .update({
        is_active: newStatus,
        availability_status: newStatus ? "available" : "unavailable",
      })
      .eq("id", variant.id);

    if (error) {
      alert("Erro ao atualizar variante: " + error.message);
      return;
    }

    await fetchVariants(selectedProduct.id);
  }

  async function handleDeleteVariant(variant: VariantSummary) {
    if (!selectedProduct) return;

    const confirmed = window.confirm(
      `Excluir definitivamente a variante ${variant.sku}?\n\n` +
        "A exclusão só será possível se não existirem imagens, histórico de preços, pedidos ou ofertas vinculadas.\n\n" +
        "Esta ação não poderá ser desfeita."
    );

    if (!confirmed) return;

    setSaving(true);

    try {
      const { error } = await supabase
        .from("product_variants")
        .delete()
        .eq("id", variant.id);

      if (error) {
        if (
          error.code === "23503" ||
          error.message.toLowerCase().includes("foreign key")
        ) {
          alert(
            "Não é possível excluir esta variante porque existem registros vinculados, como imagens, histórico de preços, pedidos ou ofertas de fornecedores.\n\n" +
              "Por segurança, utilize o botão Desativar."
          );
        } else {
          alert("Erro ao excluir variante: " + error.message);
        }

        return;
      }

      alert("Variante excluída com sucesso!");

      await fetchVariants(selectedProduct.id);
      await fetchImages(selectedProduct.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";

      alert("Não foi possível excluir a variante: " + message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadImage(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file || !selectedProduct) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      alert("Formato inválido. Utilize JPG, PNG ou WEBP.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("A imagem deve ter no máximo 5 MB.");
      event.target.value = "";
      return;
    }

    setUploading(true);

    try {
      const extension =
        file.name.split(".").pop()?.toLowerCase() || "jpg";

      const filePath =
        `${selectedProduct.slug}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;

      const { data: lastImage, error: positionError } = await supabase
        .from("product_images")
        .select("position")
        .eq("product_id", selectedProduct.id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (positionError) throw positionError;

      const nextPosition = (lastImage?.position ?? -1) + 1;
      const isFirstImage = images.length === 0;

      const { error: insertError } = await supabase
        .from("product_images")
        .insert({
          product_id: selectedProduct.id,
          storage_path: publicUrl,
          alt_text: `${selectedProduct.name} - imagem do produto`,
          position: nextPosition,
          is_primary: isFirstImage,
        });

      if (insertError) throw insertError;

      alert("Imagem enviada e cadastrada com sucesso!");

      await fetchImages(selectedProduct.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";

      alert("Erro ao enviar imagem: " + message);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function handleSetPrimary(image: ProductImageSummary) {
    if (!selectedProduct) return;

    setSaving(true);

    try {
      const { error: resetError } = await supabase
        .from("product_images")
        .update({ is_primary: false })
        .eq("product_id", selectedProduct.id);

      if (resetError) throw resetError;

      const { error: primaryError } = await supabase
        .from("product_images")
        .update({ is_primary: true })
        .eq("id", image.id);

      if (primaryError) throw primaryError;

      await fetchImages(selectedProduct.id);

      alert("Imagem principal atualizada!");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";

      alert("Erro ao definir imagem principal: " + message);
    } finally {
      setSaving(false);
    }
  }

  async function handlePublishProduct() {
    if (!selectedProduct) return;

    const hasActiveVariant = variants.some(
      (variant) => variant.is_active && variant.price_cents !== null
    );

    if (!hasActiveVariant) {
      alert("Cadastre e ative pelo menos uma variante com preço.");
      return;
    }

    if (images.length === 0) {
      alert("Cadastre pelo menos uma imagem antes de publicar.");
      return;
    }

    if (
      !window.confirm(`Publicar ${selectedProduct.name} na loja?`)
    ) {
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase
        .from("products")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
        })
        .eq("id", selectedProduct.id);

      if (error) throw error;

      alert("Produto publicado com sucesso!");

      setSelectedProduct({
        ...selectedProduct,
        status: "published",
      });

      await fetchProducts();
    } catch (error) {
      alert(
        "Erro ao publicar produto: " +
          (error instanceof Error ? error.message : "Erro desconhecido")
      );
    } finally {
      setSaving(false);
    }
  }

  function closeProduct() {
    setSelectedProduct(null);
    setVariants([]);
    setImages([]);
  }

  return (
    <main className="ilume-admin">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-brand-mark">I.</div>
          <div>
            <strong>ILUME</strong>
            <span>CENTRAL</span>
          </div>
        </div>

        <div className="sidebar-label">WORKSPACE</div>

        <nav className="sidebar-navigation">
          <a href="#dashboard" className="sidebar-link active">
            <LayoutDashboard size={18} />
            <span>Visão geral</span>
          </a>

          <a href="#catalogo" className="sidebar-link">
            <Smartphone size={18} />
            <span>Catálogo</span>
          </a>

          <a href="#gerenciamento" className="sidebar-link">
            <Package size={18} />
            <span>Produtos</span>
          </a>
        </nav>

        <div className="sidebar-divider" />

        <div className="sidebar-label">SISTEMA</div>

        <div className="sidebar-info">
          <div className="sidebar-status-dot" />
          <div>
            <strong>Supabase</strong>
            <span>Integração configurada</span>
          </div>
        </div>

        <div className="sidebar-footer">
          <span>ILUME TECH STORE</span>
          <small>Central administrativa</small>
          <small>© 2026 ILUME</small>
        </div>
      </aside>

      <div className="admin-workspace">
        <header className="admin-topbar">
          <div className="topbar-breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>Visão geral</strong>
          </div>

          <div className="topbar-actions">
            <span className="admin-status">
              <span className="status-dot" />
              Ambiente administrativo
            </span>

            <button
              className="icon-button"
              onClick={fetchProducts}
              disabled={loading}
              title="Atualizar catálogo"
              aria-label="Atualizar catálogo"
            >
              <RefreshCcw
                size={17}
                className={loading ? "is-spinning" : ""}
              />
            </button>
          </div>
        </header>

        <div className="admin-content">
          <section className="admin-welcome" id="dashboard">
            <div>
              <span className="eyebrow">ILUME / ADMINISTRAÇÃO</span>
              <h1>Visão geral</h1>
              <p>
                Gerencie seu catálogo, produtos, preços e campanhas em
                um só lugar.
              </p>
            </div>

            <div className="welcome-mark">
              <Layers size={26} />
            </div>
          </section>

          <section className="admin-stats">
            <article className="stat-card">
              <div className="stat-card-top">
                <span>Total de produtos</span>
                <div className="stat-icon neutral">
                  <Package size={19} />
                </div>
              </div>
              <strong>{products.length}</strong>
              <small>Produtos no catálogo</small>
            </article>

            <article className="stat-card">
              <div className="stat-card-top">
                <span>Publicados</span>
                <div className="stat-icon green">
                  <CheckCircle size={19} />
                </div>
              </div>
              <strong>{publishedCount}</strong>
              <small>Disponíveis na loja</small>
            </article>

            <article className="stat-card">
              <div className="stat-card-top">
                <span>Rascunhos</span>
                <div className="stat-icon amber">
                  <Archive size={19} />
                </div>
              </div>
              <strong>{draftCount}</strong>
              <small>Aguardando publicação</small>
            </article>

            <article className="stat-card">
              <div className="stat-card-top">
                <span>Em destaque</span>
                <div className="stat-icon purple">
                  <Star size={19} />
                </div>
              </div>
              <strong>{featuredCount}</strong>
              <small>Produtos destacados</small>
            </article>
          </section>

          <section className="catalog-section" id="catalogo">
            <div className="section-heading">
              <div>
                <span className="eyebrow">GESTÃO DE PRODUTOS</span>
                <h2>Catálogo</h2>
                <p>Consulte e gerencie os produtos da ILUME.</p>
              </div>

              <button
                className="primary-button"
                onClick={handleCreateModels}
                disabled={saving}
              >
                <Plus size={17} />
                Cadastrar 11 modelos
              </button>
            </div>

            <div className="catalog-toolbar">
              <div className="search-box">
                <Search size={17} />
                <input
                  type="search"
                  placeholder="Buscar produto pelo nome..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>

              <span className="catalog-counter">
                {filteredProducts.length} de {products.length} produtos
              </span>
            </div>

            <div className="catalog-table-wrapper">
              <table className="catalog-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Status</th>
                    <th>Campanha</th>
                    <th className="table-action-heading">Ação</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredProducts.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <div className="product-name-cell">
                          <div className="product-avatar">
                            <Smartphone size={20} />
                          </div>

                          <div>
                            <strong>{product.name}</strong>
                            <span>{product.slug}</span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span
                          className={`status-badge ${
                            product.status === "published"
                              ? "published"
                              : "draft"
                          }`}
                        >
                          <span />
                          {product.status === "published"
                            ? "Publicado"
                            : "Rascunho"}
                        </span>
                      </td>

                      <td>
                        <div className="campaign-cell">
                          {product.is_featured && (
                            <span className="mini-tag featured">
                              <Star size={12} /> Destaque
                            </span>
                          )}

                          {product.campaign_type === "promotion" && (
                            <span className="mini-tag promotion">
                              Promoção
                            </span>
                          )}

                          {product.campaign_type === "black_friday" && (
                            <span className="mini-tag black">
                              Black Friday
                            </span>
                          )}

                          {product.badge_label && (
                            <span className="mini-tag custom">
                              {product.badge_label}
                            </span>
                          )}

                          {!product.is_featured &&
                            !product.campaign_type &&
                            !product.badge_label && (
                              <span className="empty-campaign">
                                Sem campanha
                              </span>
                            )}
                        </div>
                      </td>

                      <td className="table-action-cell">
                        <button
                          className="manage-button"
                          onClick={() => handleOpenVariants(product)}
                        >
                          Gerenciar
                          <ChevronRight size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {filteredProducts.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <div className="empty-state">
                          <Package size={30} />
                          <strong>
                            {loading
                              ? "Carregando catálogo..."
                              : "Nenhum produto encontrado"}
                          </strong>
                          <span>
                            {searchTerm
                              ? "Tente pesquisar por outro nome."
                              : "Os produtos cadastrados aparecerão aqui."}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {selectedProduct && (
            <section
              className="management-section"
              id="gerenciamento"
            >
              <div className="management-heading">
                <div>
                  <span className="eyebrow">GERENCIAMENTO INDIVIDUAL</span>
                  <h2>{selectedProduct.name}</h2>
                  <p>Configurações, imagens, variantes e publicação.</p>
                </div>

                <button
                  className="icon-button close-button"
                  onClick={closeProduct}
                  aria-label="Fechar gerenciamento"
                  title="Fechar"
                >
                  <X size={19} />
                </button>
              </div>

              <div className="management-grid">
                <div className="management-main">
                  <article className="admin-panel">
                    <div className="panel-heading">
                      <div className="panel-icon">
                        <Tag size={19} />
                      </div>
                      <div>
                        <h3>Personalização e campanhas</h3>
                        <p>Configure a apresentação comercial.</p>
                      </div>
                    </div>

                    <div className="panel-content">
                      <label className="toggle-field">
                        <input
                          type="checkbox"
                          checked={selectedProduct.is_featured}
                          onChange={(event) =>
                            handleCampaignChange(
                              "is_featured",
                              event.target.checked
                            )
                          }
                        />

                        <span className="custom-checkbox">
                          <CheckCircle size={13} />
                        </span>

                        <span>
                          <strong>Produto em destaque</strong>
                          <small>Destacar este produto na loja.</small>
                        </span>
                      </label>

                      <div className="form-field">
                        <label htmlFor="campaign">Campanha do produto</label>
                        <select
                          id="campaign"
                          value={selectedProduct.campaign_type || ""}
                          onChange={(event) =>
                            handleCampaignChange(
                              "campaign_type",
                              (event.target.value || null) as CampaignType
                            )
                          }
                        >
                          <option value="">Nenhuma campanha</option>
                          <option value="promotion">Promoção</option>
                          <option value="black_friday">Black Friday</option>
                        </select>
                      </div>

                      <div className="form-field">
                        <label htmlFor="badge">Etiqueta personalizada</label>
                        <input
                          id="badge"
                          type="text"
                          maxLength={40}
                          placeholder="Ex: MAIS VENDIDO"
                          value={selectedProduct.badge_label || ""}
                          onChange={(event) =>
                            handleCampaignChange(
                              "badge_label",
                              event.target.value
                            )
                          }
                        />
                        <small>Limite de 40 caracteres.</small>
                      </div>

                      <button
                        className="primary-button full-button"
                        onClick={handleSaveCampaign}
                        disabled={saving}
                      >
                        <Save size={16} />
                        Salvar personalização
                      </button>
                    </div>
                  </article>

                  <article className="admin-panel">
                    <div className="panel-heading">
                      <div className="panel-icon">
                        <ImagePlus size={19} />
                      </div>
                      <div>
                        <h3>Imagens do produto</h3>
                        <p>Gerencie as imagens da vitrine.</p>
                      </div>
                    </div>

                    <div className="panel-content">
                      <label
                        className={`upload-area ${
                          uploading ? "uploading" : ""
                        }`}
                      >
                        <div className="upload-icon">
                          <Upload size={23} />
                        </div>

                        <strong>
                          {uploading
                            ? "Enviando imagem..."
                            : "Adicionar imagem"}
                        </strong>

                        <span>Selecione uma imagem do seu dispositivo.</span>
                        <small>JPG, PNG ou WEBP · Máximo 5 MB</small>

                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleUploadImage}
                          disabled={uploading}
                          hidden
                        />
                      </label>

                      <div className="image-grid">
                        {images.map((image) => (
                          <div
                            key={image.id}
                            className={`image-card ${
                              image.is_primary ? "primary-image" : ""
                            }`}
                          >
                            <div className="image-preview">
                              <img
                                src={image.storage_path}
                                alt={
                                  image.alt_text || selectedProduct.name
                                }
                              />

                              {image.is_primary && (
                                <span className="primary-image-label">
                                  <Star size={12} />
                                  Principal
                                </span>
                              )}
                            </div>

                            {!image.is_primary && (
                              <button
                                className="image-action"
                                onClick={() => handleSetPrimary(image)}
                                disabled={saving}
                              >
                                Definir como principal
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {images.length === 0 && (
                        <div className="inline-empty">
                          Nenhuma imagem cadastrada.
                        </div>
                      )}
                    </div>
                  </article>
                </div>

                <div className="management-side">
                  <article className="admin-panel">
                    <div className="panel-heading">
                      <div className="panel-icon">
                        <Layers size={19} />
                      </div>
                      <div>
                        <h3>Variantes cadastradas</h3>
                        <p>Capacidades, cores e preços.</p>
                      </div>
                    </div>

                    <div className="panel-content">
                      <div className="variant-list">
                        {variants.map((variant) => (
                          <div className="variant-card" key={variant.id}>
                            <div className="variant-top">
                              <div>
                                <strong>
                                  {variant.color || "Padrão"}
                                </strong>
                                <span>
                                  {variant.storage_gb
                                    ? `${variant.storage_gb} GB`
                                    : "Capacidade não definida"}
                                </span>
                              </div>

                              <span
                                className={`variant-status ${
                                  variant.is_active ? "active" : "inactive"
                                }`}
                              >
                                {variant.is_active ? "Ativa" : "Inativa"}
                              </span>
                            </div>

                            <div className="variant-price">
                              {formatPrice(variant.price_cents)}
                            </div>

                            <small className="variant-sku">
                              SKU: {variant.sku}
                            </small>

                            <div className="variant-actions">
                              <button
                                className="secondary-button"
                                onClick={() => handleToggleVariant(variant)}
                                disabled={saving}
                              >
                                {variant.is_active ? "Desativar" : "Ativar"}
                              </button>

                              <button
                                className="danger-button"
                                onClick={() => handleDeleteVariant(variant)}
                                disabled={saving}
                                title="Excluir variante"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {variants.length === 0 && (
                        <div className="inline-empty">
                          Nenhuma variante cadastrada.
                        </div>
                      )}
                    </div>
                  </article>

                  <article className="admin-panel">
                    <div className="panel-heading">
                      <div className="panel-icon">
                        <CircleDollarSign size={19} />
                      </div>
                      <div>
                        <h3>Adicionar variante</h3>
                        <p>Cadastre uma nova opção de produto.</p>
                      </div>
                    </div>

                    <div className="panel-content">
                      <form
                        onSubmit={handleAddVariant}
                        className="variant-form"
                      >
                        <div className="form-field">
                          <label htmlFor="sku">SKU</label>
                          <input
                            id="sku"
                            type="text"
                            placeholder="Código do produto"
                            value={sku}
                            onChange={(event) => setSku(event.target.value)}
                            required
                          />
                        </div>

                        <div className="form-field">
                          <label htmlFor="color">Cor</label>
                          <input
                            id="color"
                            type="text"
                            placeholder="Ex: Titânio natural"
                            value={color}
                            onChange={(event) => setColor(event.target.value)}
                          />
                        </div>

                        <div className="form-field">
                          <label htmlFor="storage">Capacidade</label>
                          <select
                            id="storage"
                            value={storage}
                            onChange={(event) => setStorage(event.target.value)}
                            required
                          >
                            <option value="64">64 GB</option>
                            <option value="128">128 GB</option>
                            <option value="256">256 GB</option>
                            <option value="512">512 GB</option>
                            <option value="1024">1 TB</option>
                            <option value="2048">2 TB</option>
                          </select>
                        </div>

                        <div className="form-field">
                          <label htmlFor="price">Preço em reais</label>
                          <div className="price-input">
                            <span>R$</span>
                            <input
                              id="price"
                              type="text"
                              inputMode="decimal"
                              placeholder="5499.00"
                              value={priceReais}
                              onChange={(event) =>
                                setPriceReais(event.target.value)
                              }
                              required
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          className="primary-button full-button"
                          disabled={saving}
                        >
                          <Plus size={17} />
                          Salvar variante e preço
                        </button>
                      </form>
                    </div>
                  </article>
                </div>
              </div>

              <div className="publication-panel">
                <div className="publication-info">
                  <div className="publication-icon">
                    {selectedProduct.status === "published" ? (
                      <Eye size={21} />
                    ) : (
                      <ExternalLink size={21} />
                    )}
                  </div>

                  <div>
                    <strong>
                      {selectedProduct.status === "published"
                        ? "Produto publicado"
                        : "Pronto para publicar?"}
                    </strong>

                    <span>
                      {selectedProduct.status === "published"
                        ? "Este produto já está publicado na loja."
                        : "Confira as imagens e variantes antes de disponibilizar na loja."}
                    </span>
                  </div>
                </div>

                {selectedProduct.status !== "published" ? (
                  <button
                    className="publish-button"
                    onClick={handlePublishProduct}
                    disabled={saving}
                  >
                    <CheckCircle size={17} />
                    Publicar produto
                  </button>
                ) : (
                  <span className="published-confirmation">
                    <CheckCircle size={17} />
                    Publicado
                  </span>
                )}
              </div>
            </section>
          )}

          <footer className="admin-footer">
            <span>ILUME CENTRAL</span>
            <span>Painel administrativo · 2026</span>
          </footer>
        </div>
      </div>
    </main>
  );
}
