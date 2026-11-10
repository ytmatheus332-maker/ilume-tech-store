
import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";
import { supabase } from "../../lib/supabase";
import {
  X,
  RefreshCcw,
  Plus,
  Package,
  CheckCircle,
  ImagePlus,
  Star,
} from "lucide-react";

interface ProductSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  brand: string;
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

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    setLoading(true);

    const { data, error } = await supabase
      .from("products")
      .select("id, name, slug, status, brand")
      .order("name");

    if (error) {
      alert("Erro ao carregar catálogo: " + error.message);
    } else {
      setProducts(data || []);
    }

    setLoading(false);
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

    const { error } = await supabase
      .from("products")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
      })
      .eq("id", selectedProduct.id);

    if (error) {
      alert("Erro ao publicar produto: " + error.message);
    } else {
      alert("Produto publicado com sucesso!");

      setSelectedProduct({
        ...selectedProduct,
        status: "published",
      });

      await fetchProducts();
    }

    setSaving(false);
  }

  return (
    <main
      style={{
        padding: "2rem",
        fontFamily: "sans-serif",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <h1>ILUME CENTRAL</h1>

        <button onClick={fetchProducts} disabled={loading}>
          <RefreshCcw size={16} />
        </button>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: selectedProduct ? "1fr 400px" : "1fr",
          gap: "2rem",
          marginTop: "2rem",
          alignItems: "start",
        }}
      >
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "8px",
            padding: "1rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <h3>Catálogo</h3>

            <button
              onClick={handleCreateModels}
              disabled={saving}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px",
                background: "#111",
                color: "#fff",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
              }}
            >
              <Plus size={16} />
              Cadastrar 11 modelos
            </button>
          </div>

          {products.map((product) => (
            <div
              key={product.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "10px",
                padding: "12px 0",
                borderBottom: "1px solid #eee",
              }}
            >
              <div>
                <strong>{product.name}</strong>
                <div style={{ fontSize: "12px", color: "#777" }}>
                  {product.status === "published"
                    ? "Publicado"
                    : "Rascunho"}
                </div>
              </div>

              <button onClick={() => handleOpenVariants(product)}>
                Gerenciar
              </button>
            </div>
          ))}

          {products.length === 0 && !loading && (
            <p>Nenhum produto encontrado.</p>
          )}
        </div>

        {selectedProduct && (
          <div
            style={{
              border: "2px solid #111",
              borderRadius: "8px",
              padding: "1rem",
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2>{selectedProduct.name}</h2>

              <button
                onClick={() => {
                  setSelectedProduct(null);
                  setVariants([]);
                  setImages([]);
                }}
              >
                <X />
              </button>
            </div>

            <h3>Imagens do produto</h3>

            <label
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                padding: "24px",
                border: "2px dashed #aaa",
                borderRadius: "8px",
                cursor: uploading ? "wait" : "pointer",
                textAlign: "center",
                marginBottom: "1rem",
              }}
            >
              <ImagePlus size={30} />

              <strong>
                {uploading ? "Enviando imagem..." : "Adicionar foto"}
              </strong>

              <small>JPG, PNG ou WEBP — máximo 5 MB</small>

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleUploadImage}
                disabled={uploading}
                style={{ display: "none" }}
              />
            </label>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "10px",
              }}
            >
              {images.map((image) => (
                <div
                  key={image.id}
                  style={{
                    border: image.is_primary
                      ? "2px solid #166534"
                      : "1px solid #ddd",
                    borderRadius: "8px",
                    padding: "6px",
                    minWidth: 0,
                  }}
                >
                  <img
                    src={image.storage_path}
                    alt={image.alt_text || selectedProduct.name}
                    style={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      objectFit: "contain",
                      borderRadius: "5px",
                    }}
                  />

                  {image.is_primary ? (
                    <p
                      style={{
                        color: "#166534",
                        fontSize: "12px",
                        textAlign: "center",
                      }}
                    >
                      <Star size={13} /> Imagem principal
                    </p>
                  ) : (
                    <button
                      onClick={() => handleSetPrimary(image)}
                      disabled={saving}
                      style={{
                        width: "100%",
                        marginTop: "6px",
                        padding: "7px",
                        cursor: "pointer",
                      }}
                    >
                      Definir como principal
                    </button>
                  )}
                </div>
              ))}
            </div>

            {images.length === 0 && (
              <p style={{ color: "#777", fontSize: "13px" }}>
                Nenhuma foto cadastrada.
              </p>
            )}

            <hr style={{ margin: "1.5rem 0" }} />

            <h3>Variantes cadastradas</h3>

            {variants.map((variant) => (
              <div
                key={variant.id}
                style={{
                  padding: "10px 0",
                  borderBottom: "1px solid #eee",
                }}
              >
                <strong>
                  {variant.color || "Padrão"} —{" "}
                  {variant.storage_gb
                    ? `${variant.storage_gb} GB`
                    : "Capacidade não definida"}
                </strong>

                <p style={{ margin: "5px 0" }}>
                  {formatPrice(variant.price_cents)}
                </p>

                <small>{variant.sku}</small>

                <div style={{ marginTop: "8px" }}>
                  <button
                    onClick={() => handleToggleVariant(variant)}
                    style={{
                      padding: "6px 10px",
                      background: variant.is_active ? "#166534" : "#555",
                      color: "#fff",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    {variant.is_active ? "Desativar" : "Ativar"}
                  </button>
                </div>
              </div>
            ))}

            {variants.length === 0 && (
              <p>Nenhuma variante cadastrada.</p>
            )}

            <hr style={{ margin: "1.5rem 0" }} />

            <h3>Adicionar variante e preço</h3>

            <form
              onSubmit={handleAddVariant}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                marginTop: "1rem",
              }}
            >
              <input
                type="text"
                placeholder="SKU"
                value={sku}
                onChange={(event) => setSku(event.target.value)}
                required
              />

              <input
                type="text"
                placeholder="Cor"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />

              <label>Capacidade</label>

              <select
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

              <input
                type="text"
                inputMode="decimal"
                placeholder="Preço (Ex: 5499.00)"
                value={priceReais}
                onChange={(event) => setPriceReais(event.target.value)}
                required
              />

              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: "12px",
                  background: "#000",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <Plus size={15} /> Salvar variante e preço
              </button>
            </form>

            <hr style={{ margin: "1.5rem 0" }} />

            {selectedProduct.status !== "published" ? (
              <button
                onClick={handlePublishProduct}
                disabled={saving}
                style={{
                  width: "100%",
                  padding: "12px",
                  background: "#166534",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <CheckCircle size={16} /> PUBLICAR PRODUTO
              </button>
            ) : (
              <p style={{ color: "#166534" }}>
                <Package size={16} /> Produto publicado
              </p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
