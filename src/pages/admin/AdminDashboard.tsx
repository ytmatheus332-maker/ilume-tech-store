
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ChangeEvent,
} from "react";

import { supabase } from "../../lib/supabase";
import GatewaySettings from "../../components/admin/GatewaySettings";
import ShipmentManager from "../../components/admin/ShipmentManager";
import "./AdminDashboard.css";

import {
  X, RefreshCcw, Plus, Package, CheckCircle, ImagePlus, Star,
  Trash2, Tag, Save, Search, Smartphone, LayoutDashboard,
  ChevronRight, Eye, Archive, Layers, Upload, CircleDollarSign,
  ExternalLink, Pencil, FilePlus2, CreditCard, ShoppingBag,
  User, Clock,
} from "lucide-react";

type CampaignType = "promotion" | "black_friday" | null;
type ProductStatus = "draft" | "published" | "inactive" | "archived";
type AdminView = "visao-geral" | "catalogo" | "produto" | "gateway" | "pedidos";

interface CategorySummary {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  parent_id: string | null;
}

interface CategoryOption extends CategorySummary {
  depth: number;
}

interface DashboardSale {
  total_amount_cents: number;
  status: string;
  created_at: string;
}

interface ProductSummary {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  brand: string | null;
  model: string | null;
  short_description: string | null;
  description: string | null;
  status: ProductStatus;
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

interface PendingImageCleanup {
  productId: string;
  token: string;
}

interface ProductFormState {
  category_id: string;
  name: string;
  slug: string;
  brand: string;
  model: string;
  short_description: string;
  description: string;
}

interface OrderItem {
  id: string;
  quantity: number;
  unit_price_cents: number;
  product_variants: {
    sku: string | null;
    color: string | null;
    storage_gb: number | null;
    products: {
      name: string | null;
    } | null;
  } | null;
}

interface OrderSummary {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  total_amount_cents: number;
  status: string;
  gateway: string | null;
  gateway_payment_id: string | null;
  created_at: string;
  order_items: OrderItem[];
}

const EMPTY_PRODUCT_FORM: ProductFormState = {
  category_id: "",
  name: "",
  slug: "",
  brand: "",
  model: "",
  short_description: "",
  description: "",
};

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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

async function readProductImagesApiResponse(response: Response): Promise<Record<string, any>> {
  const body = await response.text();
  if (!body.trim()) {
    throw new Error(`A API de imagens respondeu sem conteúdo (HTTP ${response.status}). Inicie o projeto com o comando local que executa as APIs.`);
  }

  let result: unknown;
  try {
    result = JSON.parse(body);
  } catch {
    throw new Error(`A API de imagens respondeu em formato inválido (HTTP ${response.status}). Confirme que o servidor local está executando as funções da pasta api.`);
  }

  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(`A API de imagens retornou uma resposta inválida (HTTP ${response.status}).`);
  }

  return result as Record<string, any>;
}

function getStatusLabel(status: ProductStatus) {
  const labels: Record<ProductStatus, string> = {
    draft: "Rascunho",
    published: "Publicado",
    inactive: "Inativo",
    archived: "Arquivado",
  };

  return labels[status] || status;
}

function getStatusClass(status: ProductStatus) {
  const classes: Record<ProductStatus, string> = {
    draft: "draft",
    published: "published",
    inactive: "inactive",
    archived: "archived",
  };

  return classes[status] || "draft";
}

function getOrderStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Pendente",
    approved: "Aprovado",
    paid: "Pago",
    processing: "Em processamento",
    shipped: "Enviado",
    delivered: "Entregue",
    failed: "Falhou",
    rejected: "Recusado",
    cancelled: "Cancelado",
    canceled: "Cancelado",
    expired: "Expirado",
    refunded: "Reembolsado",
    chargeback: "Contestação",
  };

  return labels[status.toLowerCase()] || status;
}

function getOrderStatusClass(status: string) {
  const normalized = status.toLowerCase();

  if (["approved", "paid", "delivered"].includes(normalized)) {
    return "published";
  }

  if (["pending", "processing", "shipped"].includes(normalized)) {
    return "draft";
  }

  if (["refunded", "cancelled", "canceled", "expired"].includes(normalized)) {
    return "archived";
  }

  return "inactive";
}

export default function AdminDashboard() {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [variants, setVariants] = useState<VariantSummary[]>([]);
  const [images, setImages] = useState<ProductImageSummary[]>([]);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  const [retryingImageCleanup, setRetryingImageCleanup] = useState(false);
  const [pendingImageCleanups, setPendingImageCleanups] = useState<PendingImageCleanup[]>(() => {
    try {
      const stored = window.localStorage.getItem("ilume_admin_product_image_cleanup_v1");
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed.filter((item) =>
        item && typeof item.productId === "string" && typeof item.token === "string"
      ) as PendingImageCleanup[] : [];
    } catch {
      return [];
    }
  });

  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [dashboardSales, setDashboardSales] = useState<DashboardSale[]>([]);
  const [dashboardOrderCount, setDashboardOrderCount] = useState<number | null>(null);
  const [dashboardAnalyticsLoading, setDashboardAnalyticsLoading] = useState(false);
  const [dashboardAnalyticsError, setDashboardAnalyticsError] = useState<string | null>(null);
  const [dashboardSalesTruncated, setDashboardSalesTruncated] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderSummary | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");

  const [selectedProduct, setSelectedProduct] =
    useState<ProductSummary | null>(null);

  const [productFormOpen, setProductFormOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productForm, setProductForm] =
    useState<ProductFormState>(EMPTY_PRODUCT_FORM);

  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [sku, setSku] = useState("");
  const [productSkus, setProductSkus] = useState<Record<string, string[]>>({});
  const [productSkuSearchUnavailable, setProductSkuSearchUnavailable] = useState(false);
  const [color, setColor] = useState("");
  const [storage, setStorage] = useState("128");
  const [priceReais, setPriceReais] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProductCategoryId, setSelectedProductCategoryId] = useState("all");
  const [productStatusFilter, setProductStatusFilter] = useState("all");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [activeView, setActiveView] = useState<AdminView>("visao-geral");

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [activeView]);

  const publishedCount = useMemo(
    () => products.filter((product) => product.status === "published").length,
    [products]
  );

  const draftCount = useMemo(
    () => products.filter((product) => product.status === "draft").length,
    [products]
  );

  const featuredCount = useMemo(
    () => products.filter((product) => product.is_featured).length,
    [products]
  );

  const hierarchicalCategories = useMemo<CategoryOption[]>(() => {
    const byId = new Map(categories.map((category) => [category.id, category]));
    const children = new Map<string | null, CategorySummary[]>();
    categories.forEach((category) => {
      const parentId = category.parent_id && byId.has(category.parent_id) ? category.parent_id : null;
      const group = children.get(parentId) || [];
      group.push(category);
      children.set(parentId, group);
    });

    const result: CategoryOption[] = [];
    const visited = new Set<string>();
    const visit = (parentId: string | null, depth: number) => {
      (children.get(parentId) || [])
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        .forEach((category) => {
          if (visited.has(category.id)) return;
          visited.add(category.id);
          result.push({ ...category, depth });
          visit(category.id, depth + 1);
        });
    };
    visit(null, 0);
    categories.forEach((category) => {
      if (!visited.has(category.id)) result.push({ ...category, depth: 0 });
    });
    return result;
  }, [categories]);

  const categorySubtreeIds = useMemo(() => {
    const children = new Map<string, string[]>();
    categories.forEach((category) => {
      if (!category.parent_id) return;
      const siblings = children.get(category.parent_id) || [];
      siblings.push(category.id);
      children.set(category.parent_id, siblings);
    });

    const result: Record<string, string[]> = {};
    categories.forEach((category) => {
      const descendants = new Set<string>();
      const pending = [category.id];
      while (pending.length > 0) {
        const current = pending.pop()!;
        if (descendants.has(current)) continue;
        descendants.add(current);
        pending.push(...(children.get(current) || []));
      }
      result[category.id] = [...descendants];
    });
    return result;
  }, [categories]);

  const categoryNavigationOptions = useMemo(() => hierarchicalCategories.map((category) => {
    const subtree = new Set(categorySubtreeIds[category.id] || [category.id]);
    return {
      ...category,
      productCount: products.filter((product) => product.category_id !== null && subtree.has(product.category_id)).length,
    };
  }), [categorySubtreeIds, hierarchicalCategories, products]);

  const uncategorizedProductCount = useMemo(
    () => products.filter((product) => product.category_id === null).length,
    [products]
  );

  const categoryProductCounts = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((product) => {
      const key = product.category_id || "__uncategorized__";
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return [...counts.entries()]
      .map(([categoryId, count]) => ({
        id: categoryId,
        name: categoryId === "__uncategorized__"
          ? "Sem categoria"
          : categories.find((category) => category.id === categoryId)?.name || "Categoria não disponível",
        count,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"))
      .slice(0, 6);
  }, [categories, products]);

  const productStatusCounts = useMemo(() => ([
    { key: "published", label: "Publicados", count: products.filter((product) => product.status === "published").length, color: "#58bd8d" },
    { key: "draft", label: "Rascunhos", count: products.filter((product) => product.status === "draft").length, color: "#d6b36b" },
    { key: "inactive", label: "Inativos", count: products.filter((product) => product.status === "inactive").length, color: "#88909e" },
    { key: "archived", label: "Arquivados", count: products.filter((product) => product.status === "archived").length, color: "#aa8dd4" },
  ]), [products]);

  const salesByMonth = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      return {
        key,
        label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", ""),
        total: dashboardSales
          .filter((sale) => sale.created_at.slice(0, 7) === key && ["approved", "paid"].includes(sale.status.toLowerCase()))
          .reduce((sum, sale) => sum + sale.total_amount_cents, 0),
      };
    });
  }, [dashboardSales]);

  const dashboardSalesTotal = useMemo(
    () => dashboardSales.reduce((sum, sale) => sum + sale.total_amount_cents, 0),
    [dashboardSales]
  );

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = selectedProductCategoryId === "all"
        ? true
        : selectedProductCategoryId === "__uncategorized__"
          ? product.category_id === null
          : (categorySubtreeIds[selectedProductCategoryId] || [selectedProductCategoryId]).includes(product.category_id || "");
      const matchesStatus = productStatusFilter === "all" || product.status === productStatusFilter;
      if (!matchesCategory || !matchesStatus) return false;
      if (!term) return true;

      const categoryName = categories.find((category) => category.id === product.category_id)?.name || "";
      const matchesText = [product.name, product.slug, product.brand || "", product.model || "", categoryName]
        .some((value) => value.toLowerCase().includes(term));
      const matchesSku = (productSkus[product.id] || []).some((value) => value.toLowerCase().includes(term));
      return matchesText || matchesSku;
    });
  }, [products, categories, searchTerm, selectedProductCategoryId, categorySubtreeIds, productStatusFilter, productSkus]);

  const filteredOrders = useMemo(() => {
    const term = orderSearch.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesSearch =
        !term ||
        order.customer_name.toLowerCase().includes(term) ||
        order.customer_email.toLowerCase().includes(term) ||
        order.id.toLowerCase().includes(term);

      const matchesStatus =
        orderStatusFilter === "all" ||
        order.status.toLowerCase() === orderStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [orders, orderSearch, orderStatusFilter]);

  const pendingOrdersCount = useMemo(
    () => orders.filter((order) => order.status.toLowerCase() === "pending").length,
    [orders]
  );

  const approvedOrdersCount = useMemo(
    () => orders.filter((order) =>
      ["approved", "paid"].includes(order.status.toLowerCase())
    ).length,
    [orders]
  );

  const totalOrdersValue = useMemo(
    () => orders
      .filter((order) => ["approved", "paid"].includes(order.status.toLowerCase()))
      .reduce((total, order) => total + order.total_amount_cents, 0),
    [orders]
  );

  useEffect(() => {
    void fetchInitialData();
  }, []);

  async function fetchInitialData() {
    await Promise.all([fetchProducts(), fetchCategories(), fetchDashboardAnalytics()]);
  }

  async function fetchDashboardAnalytics() {
    setDashboardAnalyticsLoading(true);
    setDashboardAnalyticsError(null);
    setDashboardSalesTruncated(false);
    try {
      const { count, error: countError } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true });
      if (countError) throw countError;
      setDashboardOrderCount(count ?? 0);

      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      start.setMonth(start.getMonth() - 11);
      const pageSize = 1000;
      const maxRows = 5000;
      const rows: DashboardSale[] = [];
      let offset = 0;
      let expectedCount: number | null = null;

      while (offset < maxRows) {
        const { data, count: salesCount, error } = await supabase
          .from("orders")
          .select("total_amount_cents, status, created_at", { count: "exact" })
          .in("status", ["approved", "paid"])
          .gte("created_at", start.toISOString())
          .order("created_at", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        expectedCount = salesCount;
        rows.push(...((data || []) as DashboardSale[]));
        if (!data || data.length < pageSize) break;
        offset += pageSize;
      }

      setDashboardSales(rows);
      setDashboardSalesTruncated(expectedCount !== null && expectedCount > rows.length);
    } catch (error) {
      console.error("Erro ao carregar indicadores do dashboard:", error);
      setDashboardAnalyticsError(error instanceof Error ? error.message : "Indicadores indisponíveis.");
      setDashboardOrderCount(null);
      setDashboardSales([]);
    } finally {
      setDashboardAnalyticsLoading(false);
    }
  }

  async function fetchProducts() {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, category_id, name, slug, brand, model, short_description, description, status, is_featured, campaign_type, badge_label"
        )
        .order("name");

      if (error) throw error;
      const loadedProducts = (data || []) as ProductSummary[];
      setProducts(loadedProducts);

      if (loadedProducts.length === 0) {
        setProductSkus({});
        setProductSkuSearchUnavailable(false);
        return;
      }

      const { data: variantRows, error: variantError } = await supabase
        .from("product_variants")
        .select("product_id, sku")
        .in("product_id", loadedProducts.map((product) => product.id));

      if (variantError) {
        console.error("Não foi possível carregar SKUs para a busca do catálogo:", variantError.message);
        setProductSkus({});
        setProductSkuSearchUnavailable(true);
      } else {
        const skuMap: Record<string, string[]> = {};
        (variantRows || []).forEach((row) => {
          if (!row.sku) return;
          (skuMap[row.product_id] ||= []).push(row.sku);
        });
        setProductSkus(skuMap);
        setProductSkuSearchUnavailable(false);
      }
    } catch (error) {
      alert("Erro ao carregar catálogo: " +
        (error instanceof Error ? error.message : "Erro desconhecido"));
    } finally {
      setLoading(false);
    }
  }

  async function fetchCategories() {
    try {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug, is_active, parent_id")
        .order("name");

      if (error) throw error;
      setCategories((data || []) as CategorySummary[]);
    } catch (error) {
      alert("Erro ao carregar categorias: " +
        (error instanceof Error ? error.message : "Erro desconhecido"));
    }
  }

  async function fetchOrders() {
    setOrdersLoading(true);

    try {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id,
          customer_name,
          customer_email,
          customer_phone,
          total_amount_cents,
          status,
          gateway,
          gateway_payment_id,
          created_at,
          order_items (
            id,
            quantity,
            unit_price_cents,
            product_variants (
              sku,
              color,
              storage_gb,
              products (
                name
              )
            )
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setOrders((data || []) as unknown as OrderSummary[]);
    } catch (error) {
      console.error("Erro ao carregar pedidos:", error);
      alert(
        "Não foi possível carregar os pedidos. Verifique se sua conta possui a função owner/admin e se as políticas RLS permitem a leitura.\n\n" +
        (error instanceof Error ? error.message : "Erro desconhecido")
      );
    } finally {
      setOrdersLoading(false);
    }
  }

  async function openOrdersView() {
    setActiveView("pedidos");
    setSelectedOrder(null);
    await fetchOrders();
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

  function openCreateProductForm() {
    setEditingProductId(null);
    setProductForm(EMPTY_PRODUCT_FORM);
    setSlugManuallyEdited(false);
    setProductFormOpen(true);

    setTimeout(() => {
      document.getElementById("product-form")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function openEditProductForm(product: ProductSummary) {
    setEditingProductId(product.id);
    setProductForm({
      category_id: product.category_id || "",
      name: product.name,
      slug: product.slug,
      brand: product.brand || "",
      model: product.model || "",
      short_description: product.short_description || "",
      description: product.description || "",
    });

    setSlugManuallyEdited(true);
    setProductFormOpen(true);

    setTimeout(() => {
      document.getElementById("product-form")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function closeProductForm() {
    setProductFormOpen(false);
    setEditingProductId(null);
    setProductForm(EMPTY_PRODUCT_FORM);
    setSlugManuallyEdited(false);
  }

  function handleProductNameChange(value: string) {
    setProductForm((current) => ({
      ...current,
      name: value,
      slug: slugManuallyEdited ? current.slug : slugify(value),
    }));
  }

  function handleProductSlugChange(value: string) {
    setSlugManuallyEdited(true);
    setProductForm((current) => ({ ...current, slug: slugify(value) }));
  }

  function handleProductFormChange(field: keyof ProductFormState, value: string) {
    setProductForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSaveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = productForm.name.trim();
    const slug = slugify(productForm.slug);

    if (!name) return alert("Informe o nome do produto.");
    if (!slug) return alert("Informe um slug válido para o produto.");
    if (!productForm.category_id) return alert("Selecione uma categoria ativa para direcionar o produto corretamente na loja.");

    const assignedCategory = categories.find((category) => category.id === productForm.category_id);
    if (!assignedCategory) {
      return alert("Selecione uma categoria válida e ativa.");
    }
    const existingCategoryId = editingProductId
      ? products.find((product) => product.id === editingProductId)?.category_id
      : null;
    if (!assignedCategory.is_active && existingCategoryId !== assignedCategory.id) {
      return alert("Categorias inativas não podem ser atribuídas a produtos.");
    }

    setSaving(true);

    try {
      const { data: existingProduct, error: slugError } = await supabase
        .from("products")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();

      if (slugError) throw slugError;

      if (existingProduct && existingProduct.id !== editingProductId) {
        alert("Este slug já está sendo utilizado por outro produto.");
        return;
      }

      const productData = {
        category_id: productForm.category_id || null,
        name,
        slug,
        brand: productForm.brand.trim() || null,
        model: productForm.model.trim() || null,
        short_description: productForm.short_description.trim() || null,
        description: productForm.description.trim() || null,
      };

      if (editingProductId) {
        const { error } = await supabase.from("products")
          .update({ ...productData, updated_at: new Date().toISOString() })
          .eq("id", editingProductId);
        if (error) throw error;
        alert("Produto atualizado com sucesso!");
      } else {
        const { error } = await supabase.from("products")
          .insert({ ...productData, status: "draft" });
        if (error) throw error;
        alert("Produto cadastrado como rascunho com sucesso!");
      }

      await fetchProducts();

      if (editingProductId && selectedProduct?.id === editingProductId) {
        setSelectedProduct((current) => current ? { ...current, ...productData } : current);
      }

      closeProductForm();
    } catch (error) {
      alert("Não foi possível salvar o produto: " +
        (error instanceof Error ? error.message : "Erro desconhecido"));
    } finally {
      setSaving(false);
    }
  }

  async function handleOpenVariants(product: ProductSummary) {
    setSelectedProduct(product);
    setActiveView("produto");
    setColor("");
    setStorage("128");
    setPriceReais("");
    setSku(`${product.slug.toUpperCase()}-${Date.now().toString().slice(-6)}`);

    await Promise.all([fetchVariants(product.id), fetchImages(product.id)]);

    setTimeout(() => {
      document.getElementById("gerenciamento")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function handleCampaignChange(
    field: "is_featured" | "campaign_type" | "badge_label",
    value: boolean | CampaignType | string
  ) {
    if (!selectedProduct) return;
    setSelectedProduct({ ...selectedProduct, [field]: value });
  }

  async function handleSaveCampaign() {
    if (!selectedProduct) return;
    setSaving(true);

    try {
      const { error } = await supabase.from("products")
        .update({
          is_featured: selectedProduct.is_featured,
          campaign_type: selectedProduct.campaign_type,
          badge_label: selectedProduct.badge_label?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedProduct.id);

      if (error) throw error;
      alert("Personalização do produto salva com sucesso!");
      await fetchProducts();
    } catch (error) {
      alert("Erro ao salvar personalização: " +
        (error instanceof Error ? error.message : "Erro desconhecido"));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProduct) return;

    const priceNum = Number(priceReais.replace(",", "."));
    const storageNum = Number(storage);

    if (!Number.isFinite(priceNum) || priceNum <= 0) return alert("Informe um preço válido.");
    if (!Number.isInteger(storageNum) || storageNum <= 0) return alert("Informe uma capacidade válida.");
    if (!sku.trim()) return alert("Informe o SKU.");

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
      setSku(`${selectedProduct.slug.toUpperCase()}-${Date.now().toString().slice(-6)}`);
      await fetchVariants(selectedProduct.id);
    } catch (error) {
      alert("Erro ao cadastrar variante: " +
        (error instanceof Error ? error.message : "Erro desconhecido"));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleVariant(variant: VariantSummary) {
    if (!selectedProduct) return;

    if (!variant.is_active &&
      (variant.price_cents === null || variant.price_cents <= 0)) {
      return alert("Defina um preço válido antes de ativar esta variante.");
    }

    const newStatus = !variant.is_active;

    const { error } = await supabase.from("product_variants")
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
      "A exclusão só será possível se não existirem registros vinculados.\n\n" +
      "Esta ação não poderá ser desfeita."
    );

    if (!confirmed) return;
    setSaving(true);

    try {
      const { error } = await supabase.from("product_variants")
        .delete()
        .eq("id", variant.id);

      if (error) {
        if (error.code === "23503" || error.message.toLowerCase().includes("foreign key")) {
          alert("Não é possível excluir esta variante porque existem registros vinculados. Utilize o botão Desativar.");
        } else {
          alert("Erro ao excluir variante: " + error.message);
        }
        return;
      }

      alert("Variante excluída com sucesso!");
      await fetchVariants(selectedProduct.id);
      await fetchImages(selectedProduct.id);
    } catch (error) {
      alert("Não foi possível excluir a variante: " +
        (error instanceof Error ? error.message : "Erro desconhecido"));
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadImage(event: ChangeEvent<HTMLInputElement>) {
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
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const filePath = `${selectedProduct.slug}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

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

      const { error: insertError } = await supabase.from("product_images").insert({
        product_id: selectedProduct.id,
        storage_path: publicUrlData.publicUrl,
        alt_text: `${selectedProduct.name} - imagem do produto`,
        position: nextPosition,
        is_primary: isFirstImage,
      });

      if (insertError) throw insertError;

      alert("Imagem enviada e cadastrada com sucesso!");
      await fetchImages(selectedProduct.id);
    } catch (error) {
      alert("Erro ao enviar imagem: " +
        (error instanceof Error ? error.message : "Erro desconhecido"));
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function handleSetPrimary(image: ProductImageSummary) {
    if (!selectedProduct) return;
    setSaving(true);

    try {
      const { error: resetError } = await supabase.from("product_images")
        .update({ is_primary: false })
        .eq("product_id", selectedProduct.id);

      if (resetError) throw resetError;

      const { error: primaryError } = await supabase.from("product_images")
        .update({ is_primary: true })
        .eq("id", image.id);

      if (primaryError) throw primaryError;

      await fetchImages(selectedProduct.id);
      alert("Imagem principal atualizada!");
    } catch (error) {
      alert("Erro ao definir imagem principal: " +
        (error instanceof Error ? error.message : "Erro desconhecido"));
    } finally {
      setSaving(false);
    }
  }

  function savePendingImageCleanups(next: PendingImageCleanup[]) {
    setPendingImageCleanups(next);
    try {
      window.localStorage.setItem("ilume_admin_product_image_cleanup_v1", JSON.stringify(next));
      return true;
    } catch (error) {
      console.error("Não foi possível salvar a pendência de limpeza da imagem.", error);
      return false;
    }
  }

  async function getAdminAccessToken() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session?.access_token) throw new Error("Sua sessão expirou. Entre novamente no painel.");
    return data.session.access_token;
  }

  async function handleDeleteImage(image: ProductImageSummary) {
    if (!selectedProduct) return;
    const confirmed = window.confirm(
      `Excluir permanentemente esta foto de ${selectedProduct.name}?\n\nA imagem será removida da galeria e do armazenamento. Esta ação não pode ser desfeita.`
    );
    if (!confirmed) return;
    setDeletingImageId(image.id);
    try {
      const token = await getAdminAccessToken();
      const response = await fetch("/api/admin/product-images", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "delete", image_id: image.id, product_id: selectedProduct.id }),
      });
      const result = await readProductImagesApiResponse(response);
      if (result.imageRemoved) await fetchImages(selectedProduct.id);
      let cleanupPersisted = true;
      if (result.cleanupToken) {
        cleanupPersisted = savePendingImageCleanups([
          ...pendingImageCleanups.filter((item) => item.token !== result.cleanupToken),
          { productId: selectedProduct.id, token: result.cleanupToken },
        ]);
      }
      if (!response.ok || !result.success) {
        alert(`${result.error || "Não foi possível concluir a exclusão da imagem."}${result.cleanupToken && !cleanupPersisted ? " A tentativa de limpeza não pôde ser salva para depois; mantenha este painel aberto e tente novamente antes de sair." : ""}`);
        return;
      }
      await fetchImages(selectedProduct.id);
      alert("Imagem removida da galeria e do Storage.");
    } catch (error) {
      alert("Não foi possível excluir a imagem: " + (error instanceof Error ? error.message : "Erro desconhecido"));
    } finally {
      setDeletingImageId(null);
    }
  }

  async function handleRetryImageCleanup(item: PendingImageCleanup) {
    setRetryingImageCleanup(true);
    try {
      const token = await getAdminAccessToken();
      const response = await fetch("/api/admin/product-images", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "cleanup", cleanup_token: item.token }),
      });
      const result = await readProductImagesApiResponse(response);
      if (!response.ok || !result.success) throw new Error(result.error || "A limpeza do Storage não foi concluída.");
      savePendingImageCleanups(pendingImageCleanups.filter((pending) => pending.token !== item.token));
      alert("Arquivo pendente removido do Storage.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível concluir a limpeza do Storage.");
    } finally {
      setRetryingImageCleanup(false);
    }
  }

  async function handlePublishProduct() {
    if (!selectedProduct) return;

    const hasActiveVariant = variants.some((variant) =>
      variant.is_active && variant.price_cents !== null && variant.price_cents > 0
    );

    if (!hasActiveVariant) return alert("Cadastre e ative pelo menos uma variante com preço válido.");
    if (images.length === 0) return alert("Cadastre pelo menos uma imagem antes de publicar.");
    if (!images.some((image) => image.is_primary)) return alert("Defina uma imagem principal antes de publicar.");
    if (!window.confirm(`Publicar ${selectedProduct.name} na loja?`)) return;

    setSaving(true);

    try {
      const { error } = await supabase.from("products")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedProduct.id);

      if (error) throw error;

      alert("Produto publicado com sucesso!");
      setSelectedProduct({ ...selectedProduct, status: "published" });
      await fetchProducts();
    } catch (error) {
      alert("Erro ao publicar produto: " +
        (error instanceof Error ? error.message : "Erro desconhecido"));
    } finally {
      setSaving(false);
    }
  }

  function closeProduct() {
    setSelectedProduct(null);
    setVariants([]);
    setImages([]);
    setActiveView("catalogo");
  }

  function closeOrderDetails() {
    setSelectedOrder(null);
  }

  const salesChartPoints = salesByMonth.map((month, index) => {
    const maxValue = Math.max(1, ...salesByMonth.map((item) => item.total));
    const x = 42 + index * (596 / Math.max(1, salesByMonth.length - 1));
    const y = 184 - (month.total / maxValue) * 138;
    return { ...month, x, y };
  });
  const salesChartPath = salesChartPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const salesChartArea = salesChartPoints.length > 0
    ? `${salesChartPath} L ${salesChartPoints[salesChartPoints.length - 1].x} 190 L ${salesChartPoints[0].x} 190 Z`
    : "";
  const productStatusTotal = productStatusCounts.reduce((total, item) => total + item.count, 0);
  const statusCircumference = 2 * Math.PI * 43;
  let statusStrokeOffset = 0;
  const statusSegments = productStatusCounts.map((item) => {
    const length = productStatusTotal > 0 ? item.count / productStatusTotal * statusCircumference : 0;
    const segment = { ...item, length, offset: statusStrokeOffset };
    statusStrokeOffset += length;
    return segment;
  });

  return (
    <main className="ilume-admin">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-brand-mark">I.</div>
          <div><strong>ILUME</strong><span>CENTRAL</span></div>
        </div>

        <div className="sidebar-label">WORKSPACE</div>

        <nav className="sidebar-navigation">
          <div className="sidebar-nav-group">
            <span className="sidebar-group-label">Visão geral</span>
            <button type="button" aria-current={activeView === "visao-geral" ? "page" : undefined} className={`sidebar-link ${activeView === "visao-geral" ? "active" : ""}`} onClick={() => setActiveView("visao-geral")}>
              <LayoutDashboard size={18} /><span>Dashboard</span>
            </button>
          </div>

          <div className="sidebar-nav-group">
            <span className="sidebar-group-label">Catálogo e marketing</span>
            <button type="button" aria-current={activeView === "catalogo" ? "page" : undefined} className={`sidebar-link ${activeView === "catalogo" ? "active" : ""}`} onClick={() => setActiveView("catalogo")}>
              <Smartphone size={18} /><span>Produtos</span><em className="sidebar-count">{products.length}</em>
            </button>
            <button type="button" aria-current={activeView === "produto" ? "page" : undefined} className={`sidebar-link ${activeView === "produto" ? "active" : ""}`} onClick={() => setActiveView("produto")}>
              <Package size={18} /><span>Variantes, galeria e campanhas</span>
            </button>
          </div>

          <div className="sidebar-nav-group">
            <span className="sidebar-group-label">Vendas</span>
            <button type="button" aria-current={activeView === "pedidos" ? "page" : undefined} className={`sidebar-link ${activeView === "pedidos" ? "active" : ""}`} onClick={() => void openOrdersView()}>
              <ShoppingBag size={18} /><span>Pedidos e logística</span>
              {pendingOrdersCount > 0 && <em className="sidebar-count">{pendingOrdersCount}</em>}
            </button>
          </div>

          <div className="sidebar-nav-group">
            <span className="sidebar-group-label">Configurações</span>
            <button type="button" aria-current={activeView === "gateway" ? "page" : undefined} className={`sidebar-link ${activeView === "gateway" ? "active" : ""}`} onClick={() => setActiveView("gateway")}>
              <CreditCard size={18} /><span>Gateway</span>
            </button>
          </div>
        </nav>

        <div className="sidebar-divider" />
        <div className="sidebar-label">SISTEMA</div>

        <div className="sidebar-info">
          <div className="sidebar-status-dot" />
          <div><strong>Supabase</strong><span>Integração configurada</span></div>
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
            <span>Workspace</span><ChevronRight size={14} />
            <strong>
              {activeView === "gateway" ? "Gateway"
                : activeView === "catalogo" ? "Catálogo"
                : activeView === "produto" ? "Gestão de produto"
                : activeView === "pedidos" ? "Pedidos"
                : "Visão geral"}
            </strong>
          </div>

          <div className="topbar-actions">
            <span className="admin-status"><span className="status-dot" />Ambiente administrativo</span>
            <button
              className="icon-button"
              onClick={() => activeView === "pedidos" ? void fetchOrders() : void fetchInitialData()}
              disabled={loading || ordersLoading}
              title="Atualizar dados"
              aria-label="Atualizar dados"
            >
              <RefreshCcw size={17} className={loading || ordersLoading ? "is-spinning" : ""} />
            </button>
          </div>
        </header>

        <div className="admin-content">
          {activeView === "visao-geral" && (
            <>
              <section className="admin-welcome" id="dashboard">
                <div>
                  <span className="eyebrow">ILUME / ADMINISTRAÇÃO</span>
                  <h1>Visão geral</h1>
                  <p>Gerencie seu catálogo, pedidos, preços e campanhas em um só lugar.</p>
                </div>
                <div className="welcome-mark"><Layers size={26} /></div>
              </section>

              <section className="admin-stats">
                <article className="stat-card">
                  <div className="stat-card-top"><span>Total de produtos</span><div className="stat-icon neutral"><Package size={19} /></div></div>
                  <strong>{products.length}</strong><small>Produtos no catálogo</small>
                </article>
                <article className="stat-card">
                  <div className="stat-card-top"><span>Publicados</span><div className="stat-icon green"><CheckCircle size={19} /></div></div>
                  <strong>{publishedCount}</strong><small>Disponíveis na loja</small>
                </article>
                <article className="stat-card">
                  <div className="stat-card-top"><span>Rascunhos</span><div className="stat-icon amber"><Archive size={19} /></div></div>
                  <strong>{draftCount}</strong><small>Aguardando publicação</small>
                </article>
                <article className="stat-card">
                  <div className="stat-card-top"><span>Em destaque</span><div className="stat-icon purple"><Star size={19} /></div></div>
                  <strong>{featuredCount}</strong><small>Produtos destacados</small>
                </article>
              </section>

              <section className="admin-stats admin-commerce-stats" aria-label="Indicadores de vendas">
                <article className="stat-card">
                  <div className="stat-card-top"><span>Total de pedidos</span><div className="stat-icon neutral"><ShoppingBag size={19} /></div></div>
                  <strong>{dashboardAnalyticsLoading ? "…" : dashboardOrderCount === null ? "—" : dashboardOrderCount}</strong>
                  <small>Contagem real de pedidos registrados</small>
                </article>
                <article className="stat-card">
                  <div className="stat-card-top"><span>Vendas aprovadas · 12 meses</span><div className="stat-icon amber"><CircleDollarSign size={19} /></div></div>
                  <strong>{dashboardAnalyticsLoading || dashboardAnalyticsError || dashboardSalesTruncated ? "—" : formatPrice(dashboardSalesTotal)}</strong>
                  <small>{dashboardSalesTruncated ? "Volume acima do limite de leitura segura" : "Somente pedidos com status aprovado ou pago"}</small>
                </article>
              </section>
              {dashboardAnalyticsError && (
                <p className="dashboard-analytics-error" role="status">
                  Indicadores de pedidos indisponíveis: {dashboardAnalyticsError}
                </p>
              )}

              <section className="dashboard-charts-grid" aria-label="Análises do catálogo e vendas">
                <article className="overview-card dashboard-chart-card">
                  <div className="overview-card-head">
                    <div><span className="eyebrow">DESEMPENHO</span><h2>Vendas aprovadas</h2><p>Valor por mês · últimos 12 meses</p></div>
                    <span className="dashboard-chart-period">12 MESES</span>
                  </div>
                  {dashboardAnalyticsError ? (
                    <div className="dashboard-chart-message">A série de vendas não pôde ser carregada.</div>
                  ) : dashboardAnalyticsLoading ? (
                    <div className="dashboard-chart-message">Carregando dados de pedidos...</div>
                  ) : dashboardSalesTruncated ? (
                    <div className="dashboard-chart-message" role="status">A consulta atingiu o limite seguro de registros. O gráfico foi ocultado para não apresentar um total parcial como se fosse completo.</div>
                  ) : (
                    <div className="sales-chart-wrap">
                      <svg className="sales-chart" viewBox="0 0 680 242" role="img" aria-label="Gráfico de vendas aprovadas por mês">
                        {[0, 1, 2, 3].map((line) => {
                          const y = 46 + line * 46;
                          return <line key={line} x1="40" x2="640" y1={y} y2={y} className="sales-chart-gridline" />;
                        })}
                        <path d={salesChartArea} className="sales-chart-area" />
                        <path d={salesChartPath} className="sales-chart-line" />
                        {salesChartPoints.map((point) => (
                          <g key={point.key}>
                            <circle cx={point.x} cy={point.y} r="3.5" className="sales-chart-point"><title>{point.label}: {formatPrice(point.total)}</title></circle>
                            <text x={point.x} y="220" className="sales-chart-label">{point.label}</text>
                          </g>
                        ))}
                      </svg>
                      {dashboardSales.length === 0 && <span className="sales-chart-empty-note">Sem vendas aprovadas no período.</span>}
                    </div>
                  )}
                </article>

                <article className="overview-card dashboard-chart-card dashboard-status-card">
                  <div className="overview-card-head">
                    <div><span className="eyebrow">CATÁLOGO</span><h2>Situação dos produtos</h2><p>Todos os status cadastrados</p></div>
                  </div>
                  <div className="status-chart-layout">
                    <svg className="status-donut" viewBox="0 0 120 120" role="img" aria-label={`Situação de ${productStatusTotal} produtos`}>
                      <circle cx="60" cy="60" r="43" className="status-donut-track" />
                      {statusSegments.map((segment) => segment.count > 0 && (
                        <circle key={segment.key} cx="60" cy="60" r="43" fill="none" stroke={segment.color}
                          strokeWidth="13" strokeDasharray={`${segment.length} ${statusCircumference - segment.length}`}
                          strokeDashoffset={-segment.offset} transform="rotate(-90 60 60)" />
                      ))}
                      <text x="60" y="57" className="status-donut-total">{productStatusTotal}</text>
                      <text x="60" y="72" className="status-donut-caption">produtos</text>
                    </svg>
                    <div className="status-chart-legend">
                      {productStatusCounts.map((item) => (
                        <div key={item.key}><span style={{ backgroundColor: item.color }} /><span>{item.label}</span><strong>{item.count}</strong></div>
                      ))}
                    </div>
                  </div>
                </article>
              </section>

              <section className="dashboard-charts-grid dashboard-charts-grid--secondary" aria-label="Produtos por categoria">
                <article className="overview-card dashboard-chart-card dashboard-category-chart">
                  <div className="overview-card-head">
                    <div><span className="eyebrow">DISTRIBUIÇÃO</span><h2>Produtos por categoria</h2><p>Categoria persistida em cada produto</p></div>
                    <button type="button" className="secondary-button" onClick={() => setActiveView("catalogo")}>Ver catálogo<ChevronRight size={15} /></button>
                  </div>
                  {categoryProductCounts.length === 0 ? <div className="dashboard-chart-message">Nenhum produto cadastrado para agrupar.</div> : (
                    <div className="category-chart-list">
                      {categoryProductCounts.map((item) => {
                        const maxCount = Math.max(1, ...categoryProductCounts.map((category) => category.count));
                        return (
                          <div className="category-chart-row" key={item.id}>
                            <span>{item.name}</span>
                            <div><i style={{ width: `${Math.max(4, item.count / maxCount * 100)}%` }} /></div>
                            <strong>{item.count}</strong>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>
              </section>

              <section className="overview-grid">
                <article className="overview-card">
                  <div className="overview-card-head">
                    <div><span className="eyebrow">CATÁLOGO</span><h2>Produtos</h2></div>
                    <button type="button" className="secondary-button" onClick={() => setActiveView("catalogo")}>Ver catálogo<ChevronRight size={15} /></button>
                  </div>

                  <div className="recent-list">
                    {products.slice(0, 5).map((product) => (
                      <div className="recent-row" key={product.id}>
                        <div className="product-name-cell">
                          <div className="product-avatar"><Smartphone size={20} /></div>
                          <div><strong>{product.name}</strong><span>{product.slug}</span></div>
                        </div>
                        <span className={`status-badge ${getStatusClass(product.status)}`}><span />{getStatusLabel(product.status)}</span>
                        <button type="button" className="manage-button" onClick={() => void handleOpenVariants(product)}>Gerenciar<ChevronRight size={15} /></button>
                      </div>
                    ))}
                    {products.length === 0 && <div className="inline-empty">{loading ? "Carregando catálogo..." : "Nenhum produto cadastrado."}</div>}
                  </div>
                </article>

                <article className="overview-card">
                  <div className="overview-card-head"><div><span className="eyebrow">ATALHOS</span><h2>Acesso rápido</h2></div></div>
                  <div className="shortcut-list">
                    <button type="button" className="shortcut-button" onClick={() => { setActiveView("catalogo"); openCreateProductForm(); }}>
                      <div className="panel-icon"><Plus size={19} /></div><div><strong>Adicionar produto</strong><span>Cadastrar um novo item no catálogo.</span></div>
                    </button>
                    <button type="button" className="shortcut-button" onClick={() => setActiveView("catalogo")}>
                      <div className="panel-icon"><Search size={19} /></div><div><strong>Buscar no catálogo</strong><span>Encontrar produtos por nome ou marca.</span></div>
                    </button>
                    <button type="button" className="shortcut-button" onClick={() => void openOrdersView()}>
                      <div className="panel-icon"><ShoppingBag size={19} /></div><div><strong>Consultar pedidos</strong><span>Visualizar vendas e pagamentos.</span></div>
                    </button>
                    <button type="button" className="shortcut-button" onClick={() => setActiveView("gateway")}>
                      <div className="panel-icon"><CreditCard size={19} /></div><div><strong>Gateway</strong><span>Gerenciar provedores de pagamento.</span></div>
                    </button>
                  </div>
                </article>
              </section>
            </>
          )}

          {activeView === "pedidos" && (
            <section className="catalog-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">GESTÃO COMERCIAL</span>
                  <h2>Pedidos</h2>
                  <p>Consulte compras, clientes, itens e situação dos pagamentos.</p>
                </div>
                <button className="secondary-button" onClick={() => void fetchOrders()} disabled={ordersLoading}>
                  <RefreshCcw size={16} />Atualizar pedidos
                </button>
              </div>

              <section className="admin-stats">
                <article className="stat-card">
                  <div className="stat-card-top"><span>Total de pedidos</span><div className="stat-icon neutral"><ShoppingBag size={19} /></div></div>
                  <strong>{orders.length}</strong><small>Pedidos registrados</small>
                </article>
                <article className="stat-card">
                  <div className="stat-card-top"><span>Pendentes</span><div className="stat-icon amber"><Clock size={19} /></div></div>
                  <strong>{pendingOrdersCount}</strong><small>Aguardando confirmação</small>
                </article>
                <article className="stat-card">
                  <div className="stat-card-top"><span>Pagos</span><div className="stat-icon green"><CheckCircle size={19} /></div></div>
                  <strong>{approvedOrdersCount}</strong><small>Pagamentos aprovados</small>
                </article>
                <article className="stat-card">
                  <div className="stat-card-top"><span>Valor aprovado</span><div className="stat-icon purple"><CircleDollarSign size={19} /></div></div>
                  <strong>{formatPrice(totalOrdersValue)}</strong><small>Somente pedidos pagos</small>
                </article>
              </section>

              <div className="catalog-toolbar">
                <div className="search-box">
                  <Search size={17} />
                  <input
                    type="search"
                    placeholder="Buscar por cliente, e-mail ou ID do pedido..."
                    value={orderSearch}
                    onChange={(event) => setOrderSearch(event.target.value)}
                  />
                </div>

                <div className="form-field">
                  <select
                    aria-label="Filtrar pedidos por status"
                    value={orderStatusFilter}
                    onChange={(event) => setOrderStatusFilter(event.target.value)}
                  >
                    <option value="all">Todos os status</option>
                    <option value="pending">Pendente</option>
                    <option value="approved">Aprovado</option>
                    <option value="paid">Pago</option>
                    <option value="failed">Falhou</option>
                    <option value="rejected">Recusado</option>
                    <option value="expired">Expirado</option>
                    <option value="refunded">Reembolsado</option>
                    <option value="chargeback">Contestação</option>
                  </select>
                </div>

                <span className="catalog-counter">{filteredOrders.length} de {orders.length} pedidos</span>
              </div>

              <div className="catalog-table-wrapper">
                <table className="catalog-table">
                  <thead>
                    <tr>
                      <th>Pedido</th><th>Cliente</th><th>Data</th><th>Pagamento</th><th>Total</th><th>Status</th><th className="table-action-heading">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <div className="product-name-cell">
                            <div className="product-avatar"><ShoppingBag size={19} /></div>
                            <div><strong>#{order.id.slice(0, 8).toUpperCase()}</strong><span>{order.order_items?.length || 0} tipo(s) de item</span></div>
                          </div>
                        </td>
                        <td>
                          <div className="product-name-cell">
                            <div><strong>{order.customer_name}</strong><span>{order.customer_email}</span></div>
                          </div>
                        </td>
                        <td><span className="category-label">{formatDate(order.created_at)}</span></td>
                        <td><span className="category-label">{order.gateway || "Não informado"}</span></td>
                        <td><strong>{formatPrice(order.total_amount_cents)}</strong></td>
                        <td><span className={`status-badge ${getOrderStatusClass(order.status)}`}><span />{getOrderStatusLabel(order.status)}</span></td>
                        <td className="table-action-cell">
                          <button type="button" className="manage-button" onClick={() => setSelectedOrder(order)}>
                            <Eye size={15} />Visualizar
                          </button>
                        </td>
                      </tr>
                    ))}

                    {filteredOrders.length === 0 && (
                      <tr>
                        <td colSpan={7}>
                          <div className="empty-state">
                            <ShoppingBag size={30} />
                            <strong>{ordersLoading ? "Carregando pedidos..." : "Nenhum pedido encontrado"}</strong>
                            <span>{orders.length === 0 ? "Os pedidos registrados aparecerão aqui." : "Tente alterar os termos da busca ou o filtro de status."}</span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {selectedOrder && (
                <div className="product-form-card" id="order-details">
                  <div className="product-form-heading">
                    <div className="product-form-title">
                      <div className="panel-icon"><ShoppingBag size={19} /></div>
                      <div>
                        <h3>Pedido #{selectedOrder.id.slice(0, 8).toUpperCase()}</h3>
                        <p>Detalhes da compra e dos itens registrados.</p>
                      </div>
                    </div>
                    <button type="button" className="icon-button" onClick={closeOrderDetails} title="Fechar detalhes" aria-label="Fechar detalhes"><X size={18} /></button>
                  </div>

                  <div className="management-grid">
                    <div className="management-main">
                      <article className="admin-panel">
                        <div className="panel-heading">
                          <div className="panel-icon"><User size={19} /></div>
                          <div><h3>Dados do cliente</h3><p>Informações registradas no checkout.</p></div>
                        </div>
                        <div className="panel-content">
                          <p><strong>Nome:</strong> {selectedOrder.customer_name}</p>
                          <p><strong>E-mail:</strong> {selectedOrder.customer_email}</p>
                          <p><strong>Telefone:</strong> {selectedOrder.customer_phone || "Não informado"}</p>
                          <p><strong>Data:</strong> {formatDate(selectedOrder.created_at)}</p>
                        </div>
                      </article>

                      <article className="admin-panel">
                        <div className="panel-heading">
                          <div className="panel-icon"><Package size={19} /></div>
                          <div><h3>Itens do pedido</h3><p>Produtos, variantes e quantidades.</p></div>
                        </div>
                        <div className="panel-content">
                          {selectedOrder.order_items?.map((item) => (
                            <div className="variant-card" key={item.id}>
                              <div className="variant-top">
                                <div>
                                  <strong>{item.product_variants?.products?.name || "Produto não identificado"}</strong>
                                  <span>{item.product_variants?.color || "Cor não informada"} · {item.product_variants?.storage_gb ? `${item.product_variants.storage_gb} GB` : "Capacidade não informada"}</span>
                                </div>
                                <span className="variant-status active">Qtd. {item.quantity}</span>
                              </div>
                              <div className="variant-price">{formatPrice(item.unit_price_cents)} / unidade</div>
                              <small className="variant-sku">Subtotal: {formatPrice(item.unit_price_cents * item.quantity)} · SKU: {item.product_variants?.sku || "N/D"}</small>
                            </div>
                          ))}
                          {(!selectedOrder.order_items || selectedOrder.order_items.length === 0) && (
                            <div className="inline-empty">Nenhum item encontrado para este pedido.</div>
                          )}
                        </div>
                      </article>
                    </div>

                    <div className="management-side">
                      <article className="admin-panel">
                        <div className="panel-heading">
                          <div className="panel-icon"><CreditCard size={19} /></div>
                          <div><h3>Pagamento</h3><p>Informações do gateway.</p></div>
                        </div>
                        <div className="panel-content">
                          <p><strong>Gateway:</strong> {selectedOrder.gateway || "Não informado"}</p>
                          <p><strong>Status:</strong></p>
                          <span className={`status-badge ${getOrderStatusClass(selectedOrder.status)}`}><span />{getOrderStatusLabel(selectedOrder.status)}</span>
                          <p><strong>ID da transação:</strong></p>
                          <small>{selectedOrder.gateway_payment_id || "Ainda não informado"}</small>
                          <div className="variant-price">Total do pedido: {formatPrice(selectedOrder.total_amount_cents)}</div>
                          <p><small>O status é atualizado pelo fluxo de pagamento e pelos webhooks. Esta tela não permite alterá-lo manualmente.</small></p>
                        </div>
                      </article>

                      <ShipmentManager orderId={selectedOrder.id} orderStatus={selectedOrder.status} />
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {activeView === "catalogo" && (
            <section className="catalog-section" id="catalogo">
              <div className="section-heading">
                <div><span className="eyebrow">GESTÃO DE PRODUTOS</span><h2>Catálogo</h2><p>Consulte, cadastre e gerencie os produtos da ILUME.</p></div>
                <button className="primary-button" onClick={openCreateProductForm} disabled={saving}><Plus size={17} />Adicionar produto</button>
              </div>

              {productFormOpen && (
                <div className="product-form-card" id="product-form">
                  <div className="product-form-heading">
                    <div className="product-form-title">
                      <div className="panel-icon">{editingProductId ? <Pencil size={19} /> : <FilePlus2 size={19} />}</div>
                      <div><h3>{editingProductId ? "Editar produto" : "Cadastrar novo produto"}</h3><p>{editingProductId ? "Atualize as informações básicas do produto." : "Cadastre qualquer produto no catálogo da ILUME."}</p></div>
                    </div>
                    <button type="button" className="icon-button" onClick={closeProductForm} aria-label="Fechar formulário" title="Fechar"><X size={18} /></button>
                  </div>

                  <form className="product-form" onSubmit={handleSaveProduct}>
                    <div className="product-form-grid">
                      <div className="form-field"><label htmlFor="product-name">Nome do produto *</label><input id="product-name" type="text" placeholder="Ex: iPhone 17 Pro Max" value={productForm.name} onChange={(event) => handleProductNameChange(event.target.value)} maxLength={160} required /></div>
                      <div className="form-field"><label htmlFor="product-category">Categoria *</label><select id="product-category" value={productForm.category_id} onChange={(event) => handleProductFormChange("category_id", event.target.value)} required disabled={categories.length === 0}><option value="">Selecione uma categoria existente</option>{hierarchicalCategories.map((category) => <option key={category.id} value={category.id} disabled={!category.is_active && category.id !== products.find((product) => product.id === editingProductId)?.category_id}>{`${"— ".repeat(category.depth)}${category.name}${category.is_active ? "" : " (inativa)"}`}</option>)}</select><small>{categories.length === 0 ? "Não há categorias cadastradas. O cadastro de produtos requer uma categoria persistida." : "A categoria cadastrada define em qual área da loja o produto será exibido."}</small></div>
                      <div className="form-field"><label htmlFor="product-brand">Marca</label><input id="product-brand" type="text" placeholder="Ex: Apple" value={productForm.brand} onChange={(event) => handleProductFormChange("brand", event.target.value)} maxLength={100} /></div>
                      <div className="form-field"><label htmlFor="product-model">Modelo</label><input id="product-model" type="text" placeholder="Ex: A3105" value={productForm.model} onChange={(event) => handleProductFormChange("model", event.target.value)} maxLength={120} /></div>
                      <div className="form-field product-form-full"><label htmlFor="product-slug">Slug / endereço do produto *</label><input id="product-slug" type="text" placeholder="nome-do-produto" value={productForm.slug} onChange={(event) => handleProductSlugChange(event.target.value)} maxLength={180} required /><small>Gerado automaticamente pelo nome. Você também pode personalizar; não pode se repetir.</small></div>
                      <div className="form-field product-form-full"><label htmlFor="product-short-description">Descrição curta</label><textarea id="product-short-description" rows={2} maxLength={300} placeholder="Resumo do produto para a vitrine." value={productForm.short_description} onChange={(event) => handleProductFormChange("short_description", event.target.value)} /></div>
                      <div className="form-field product-form-full"><label htmlFor="product-description">Descrição completa</label><textarea id="product-description" rows={5} placeholder="Informações detalhadas sobre o produto." value={productForm.description} onChange={(event) => handleProductFormChange("description", event.target.value)} /></div>
                    </div>
                    <div className="product-form-footer">
                      <span>{editingProductId ? "O status atual do produto será preservado." : "O produto será criado como rascunho e não aparecerá na loja até ser publicado."}</span>
                      <div className="product-form-actions">
                        <button type="button" className="secondary-button" onClick={closeProductForm} disabled={saving}>Cancelar</button>
                        <button type="submit" className="primary-button" disabled={saving}><Save size={16} />{saving ? "Salvando..." : editingProductId ? "Salvar alterações" : "Cadastrar produto"}</button>
                      </div>
                    </div>
                  </form>
                </div>
              )}

              <div className="catalog-browser">
                <aside className="category-filter-panel" aria-label="Filtros por categoria">
                  <div className="category-filter-heading">
                    <div><span className="eyebrow">ORGANIZAÇÃO</span><strong>Categorias</strong></div>
                    <span>{products.length}</span>
                  </div>
                  <nav className="category-filter-list" aria-label="Selecionar categoria de produtos">
                    <button type="button" className={`category-filter-option${selectedProductCategoryId === "all" ? " is-selected" : ""}`} aria-pressed={selectedProductCategoryId === "all"} onClick={() => setSelectedProductCategoryId("all")}>
                      <span>Todos os produtos</span><em>{products.length}</em>
                    </button>
                    {categoryNavigationOptions.map((category) => (
                      <button
                        type="button"
                        key={category.id}
                        className={`category-filter-option${selectedProductCategoryId === category.id ? " is-selected" : ""}`}
                        style={{ paddingLeft: `${12 + Math.min(category.depth, 5) * 13}px` }}
                        aria-pressed={selectedProductCategoryId === category.id}
                        aria-label={`${category.name}, ${category.productCount} produtos nesta categoria e subcategorias`}
                        onClick={() => setSelectedProductCategoryId(category.id)}
                      >
                        <span>{category.depth > 0 && <i aria-hidden="true">↳</i>}{category.name}</span>
                        <em>{category.productCount}</em>
                      </button>
                    ))}
                    {uncategorizedProductCount > 0 && (
                      <button type="button" className={`category-filter-option${selectedProductCategoryId === "__uncategorized__" ? " is-selected" : ""}`} aria-pressed={selectedProductCategoryId === "__uncategorized__"} onClick={() => setSelectedProductCategoryId("__uncategorized__")}>
                        <span>Sem categoria</span><em>{uncategorizedProductCount}</em>
                      </button>
                    )}
                  </nav>
                </aside>

                <div className="catalog-browser-main">
                  <div className="catalog-toolbar">
                    <div className="search-box"><Search size={17} /><input type="search" placeholder="Buscar por nome, marca, modelo ou SKU..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} /></div>
                    <div className="catalog-toolbar-controls">
                      <label className="catalog-status-filter"><span>Situação</span><select aria-label="Filtrar produtos por situação" value={productStatusFilter} onChange={(event) => setProductStatusFilter(event.target.value)}><option value="all">Todos</option><option value="published">Publicados</option><option value="draft">Rascunhos</option><option value="inactive">Inativos</option><option value="archived">Arquivados</option></select></label>
                      <span className="catalog-counter">{filteredProducts.length} de {products.length} produtos</span>
                    </div>
                  </div>
                  {productSkuSearchUnavailable && <p className="sku-search-warning" role="status">Não foi possível carregar os SKUs. A busca por nome continua disponível.</p>}

                  <div className="catalog-table-wrapper">
                <table className="catalog-table">
                  <thead><tr><th>Produto</th><th>Categoria</th><th>Status</th><th>Campanha</th><th className="table-action-heading">Ações</th></tr></thead>
                  <tbody>
                    {filteredProducts.map((product) => {
                      const category = categories.find((item) => item.id === product.category_id);
                      return (
                        <tr key={product.id}>
                          <td><div className="product-name-cell"><div className="product-avatar"><Smartphone size={20} /></div><div><strong>{product.name}</strong><span>{product.slug}{productSkus[product.id]?.length ? ` · SKU ${productSkus[product.id].join(", ")}` : ""}</span></div></div></td>
                          <td><span className="category-label">{category?.name || "Sem categoria"}</span></td>
                          <td><span className={`status-badge ${getStatusClass(product.status)}`}><span />{getStatusLabel(product.status)}</span></td>
                          <td><div className="campaign-cell">
                            {product.is_featured && <span className="mini-tag featured"><Star size={12} /> Destaque</span>}
                            {product.campaign_type === "promotion" && <span className="mini-tag promotion">Promoção</span>}
                            {product.campaign_type === "black_friday" && <span className="mini-tag black">Black Friday</span>}
                            {product.badge_label && <span className="mini-tag custom">{product.badge_label}</span>}
                            {!product.is_featured && !product.campaign_type && !product.badge_label && <span className="empty-campaign">Sem campanha</span>}
                          </div></td>
                          <td className="table-action-cell"><div className="product-row-actions">
                            <button className="edit-button" onClick={() => openEditProductForm(product)} title="Editar dados do produto"><Pencil size={14} />Editar</button>
                            <button className="manage-button" onClick={() => void handleOpenVariants(product)}>Gerenciar<ChevronRight size={15} /></button>
                          </div></td>
                        </tr>
                      );
                    })}
                    {filteredProducts.length === 0 && <tr><td colSpan={5}><div className="empty-state"><Package size={30} /><strong>{loading ? "Carregando catálogo..." : "Nenhum produto encontrado"}</strong><span>{products.length === 0 ? "Cadastre seu primeiro produto para começar." : "Tente outra categoria, busca ou situação."}</span></div></td></tr>}
                  </tbody>
                </table>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeView === "produto" && (
            <>
              {selectedProduct && (
                <section className="management-section" id="gerenciamento">
                  <div className="management-heading">
                    <div><span className="eyebrow">GERENCIAMENTO INDIVIDUAL</span><h2>{selectedProduct.name}</h2><p>Configurações, imagens, variantes e publicação.</p></div>
                    <button className="icon-button close-button" onClick={closeProduct} aria-label="Fechar gerenciamento" title="Fechar"><X size={19} /></button>
                  </div>

                  <div className="management-grid">
                    <div className="management-main">
                      <article className="admin-panel">
                        <div className="panel-heading"><div className="panel-icon"><Tag size={19} /></div><div><h3>Personalização e campanhas</h3><p>Configure a apresentação comercial.</p></div></div>
                        <div className="panel-content">
                          <label className="toggle-field">
                            <input type="checkbox" checked={selectedProduct.is_featured} onChange={(event) => handleCampaignChange("is_featured", event.target.checked)} />
                            <span className="custom-checkbox"><CheckCircle size={13} /></span>
                            <span><strong>Produto em destaque</strong><small>Destacar este produto na loja.</small></span>
                          </label>
                          <div className="form-field"><label htmlFor="campaign">Campanha do produto</label><select id="campaign" value={selectedProduct.campaign_type || ""} onChange={(event) => handleCampaignChange("campaign_type", (event.target.value || null) as CampaignType)}><option value="">Nenhuma campanha</option><option value="promotion">Promoção</option><option value="black_friday">Black Friday</option></select></div>
                          <div className="form-field"><label htmlFor="badge">Etiqueta personalizada</label><input id="badge" type="text" maxLength={40} placeholder="Ex: MAIS VENDIDO" value={selectedProduct.badge_label || ""} onChange={(event) => handleCampaignChange("badge_label", event.target.value)} /><small>Limite de 40 caracteres.</small></div>
                          <button className="primary-button full-button" onClick={() => void handleSaveCampaign()} disabled={saving}><Save size={16} />Salvar personalização</button>
                        </div>
                      </article>

                      <article className="admin-panel">
                        <div className="panel-heading"><div className="panel-icon"><ImagePlus size={19} /></div><div><h3>Imagens do produto</h3><p>Gerencie as imagens da vitrine.</p></div></div>
                        <div className="panel-content">
                          <label className={`upload-area ${uploading ? "uploading" : ""}`}>
                            <div className="upload-icon"><Upload size={23} /></div>
                            <strong>{uploading ? "Enviando imagem..." : "Adicionar imagem"}</strong>
                            <span>Selecione uma imagem do seu dispositivo.</span><small>JPG, PNG ou WEBP · Máximo 5 MB</small>
                            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleUploadImage} disabled={uploading} hidden />
                          </label>
                          <div className="image-grid">
                            {images.map((image) => (
                              <div key={image.id} className={`image-card ${image.is_primary ? "primary-image" : ""}`}>
                                <div className="image-preview">
                                  <img src={image.storage_path} alt={image.alt_text || selectedProduct.name} />
                                  {image.is_primary && <span className="primary-image-label"><Star size={12} />Principal</span>}
                                </div>
                                <div className="image-actions">
                                  {!image.is_primary && <button className="image-action" onClick={() => void handleSetPrimary(image)} disabled={saving || deletingImageId !== null}>Definir como principal</button>}
                                  <button className="image-delete-action" onClick={() => void handleDeleteImage(image)} disabled={saving || deletingImageId !== null} aria-label={`Excluir foto de ${selectedProduct.name}`} title="Excluir foto permanentemente">
                                    <Trash2 size={14} />{deletingImageId === image.id ? "Excluindo..." : "Excluir foto"}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                          {pendingImageCleanups.filter((item) => item.productId === selectedProduct.id).map((item) => (
                            <div className="image-cleanup-pending" key={item.token}>
                              <span>A foto saiu da galeria, mas a remoção do arquivo no Storage ainda está pendente.</span>
                              <button className="secondary-button" onClick={() => void handleRetryImageCleanup(item)} disabled={retryingImageCleanup}>
                                <RefreshCcw size={14} />{retryingImageCleanup ? "Tentando..." : "Tentar limpeza novamente"}
                              </button>
                            </div>
                          ))}
                          {images.length === 0 && <div className="inline-empty">Nenhuma imagem cadastrada.</div>}
                        </div>
                      </article>
                    </div>

                    <div className="management-side">
                      <article className="admin-panel">
                        <div className="panel-heading"><div className="panel-icon"><Layers size={19} /></div><div><h3>Variantes cadastradas</h3><p>Capacidades, cores e preços.</p></div></div>
                        <div className="panel-content">
                          <div className="variant-list">
                            {variants.map((variant) => (
                              <div className="variant-card" key={variant.id}>
                                <div className="variant-top"><div><strong>{variant.color || "Padrão"}</strong><span>{variant.storage_gb ? `${variant.storage_gb} GB` : "Capacidade não definida"}</span></div><span className={`variant-status ${variant.is_active ? "active" : "inactive"}`}>{variant.is_active ? "Ativa" : "Inativa"}</span></div>
                                <div className="variant-price">{formatPrice(variant.price_cents)}</div>
                                <small className="variant-sku">SKU: {variant.sku}</small>
                                <div className="variant-actions">
                                  <button className="secondary-button" onClick={() => void handleToggleVariant(variant)} disabled={saving}>{variant.is_active ? "Desativar" : "Ativar"}</button>
                                  <button className="danger-button" onClick={() => void handleDeleteVariant(variant)} disabled={saving} title="Excluir variante"><Trash2 size={15} /></button>
                                </div>
                              </div>
                            ))}
                          </div>
                          {variants.length === 0 && <div className="inline-empty">Nenhuma variante cadastrada.</div>}
                        </div>
                      </article>

                      <article className="admin-panel">
                        <div className="panel-heading"><div className="panel-icon"><CircleDollarSign size={19} /></div><div><h3>Adicionar variante</h3><p>Cadastre uma nova opção de produto.</p></div></div>
                        <div className="panel-content">
                          <form onSubmit={handleAddVariant} className="variant-form">
                            <div className="form-field"><label htmlFor="sku">SKU</label><input id="sku" type="text" placeholder="Código do produto" value={sku} onChange={(event) => setSku(event.target.value)} required /></div>
                            <div className="form-field"><label htmlFor="color">Cor</label><input id="color" type="text" placeholder="Ex: Titânio natural" value={color} onChange={(event) => setColor(event.target.value)} /></div>
                            <div className="form-field"><label htmlFor="storage">Capacidade</label><select id="storage" value={storage} onChange={(event) => setStorage(event.target.value)} required><option value="64">64 GB</option><option value="128">128 GB</option><option value="256">256 GB</option><option value="512">512 GB</option><option value="1024">1 TB</option><option value="2048">2 TB</option></select></div>
                            <div className="form-field"><label htmlFor="price">Preço em reais</label><div className="price-input"><span>R$</span><input id="price" type="text" inputMode="decimal" placeholder="5499.00" value={priceReais} onChange={(event) => setPriceReais(event.target.value)} required /></div></div>
                            <button type="submit" className="primary-button full-button" disabled={saving}><Plus size={17} />Salvar variante e preço</button>
                          </form>
                        </div>
                      </article>
                    </div>
                  </div>

                  <div className="publication-panel">
                    <div className="publication-info">
                      <div className="publication-icon">{selectedProduct.status === "published" ? <Eye size={21} /> : <ExternalLink size={21} />}</div>
                      <div><strong>{selectedProduct.status === "published" ? "Produto publicado" : "Pronto para publicar?"}</strong><span>{selectedProduct.status === "published" ? "Este produto já está publicado na loja." : "Confira as imagens e variantes antes de disponibilizar na loja."}</span></div>
                    </div>
                    {selectedProduct.status !== "published" ? <button className="publish-button" onClick={() => void handlePublishProduct()} disabled={saving}><CheckCircle size={17} />Publicar produto</button> : <span className="published-confirmation"><CheckCircle size={17} />Publicado</span>}
                  </div>
                </section>
              )}

              {!selectedProduct && (
                <section className="catalog-section" id="gerenciamento">
                  <div className="empty-state"><Package size={30} /><strong>Nenhum produto selecionado</strong><span>Escolha um produto no catálogo para gerenciar imagens, variantes e publicação.</span><button type="button" className="primary-button" onClick={() => setActiveView("catalogo")}>Ir para o catálogo</button></div>
                </section>
              )}
            </>
          )}

          {activeView === "gateway" && <GatewaySettings />}

          <footer className="admin-footer">
            <span>ILUME CENTRAL</span><span>Painel administrativo · 2026</span>
          </footer>
        </div>
      </div>
    </main>
  );
}
