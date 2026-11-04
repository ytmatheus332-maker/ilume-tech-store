
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabase";
import "./RadarTech.css";

interface News {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  category: string;
  image_url: string | null;
  published_at: string | null;
}

const categories = [
  "Todas",
  "iPhone",
  "Mac",
  "iPad",
  "Apple Watch",
  "AirPods",
  "Apple Intelligence",
  "Apple News",
];

function identifyCategory(title: string) {
  const text = title.toLowerCase();

  if (/apple intelligence|inteligência artificial|artificial intelligence|ai features/.test(text))
    return "Apple Intelligence";

  if (/apple watch|watchos/.test(text)) return "Apple Watch";
  if (/airpods/.test(text)) return "AirPods";
  if (/\bipad\b|ipados/.test(text)) return "iPad";
  if (/\bmac\b|macbook|macos|imac/.test(text)) return "Mac";
  if (/iphone|ios/.test(text)) return "iPhone";

  return "Apple News";
}

function formatDate(date: string | null) {
  if (!date) return "Data não disponível";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return "Data não disponível";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

export default function RadarTech() {
  const [news, setNews] = useState<News[]>([]);
  const [activeCategory, setActiveCategory] = useState("Todas");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadNews() {
    setLoading(true);
    setError("");

    const { data, error: requestError } = await supabase
      .from("radar_tech_news")
      .select(
        "id, title, summary, url, source, category, image_url, published_at"
      )
      .order("published_at", { ascending: false })
      .limit(100);

    if (requestError) {
      console.error("Erro ao carregar Radar Tech:", requestError);
      setError("Não foi possível carregar as notícias. Tente novamente.");
      setLoading(false);
      return;
    }

    setNews(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadNews();
  }, []);

  const categorizedNews = useMemo(
    () =>
      news.map((item) => ({
        ...item,
        detectedCategory: identifyCategory(item.title),
      })),
    [news]
  );

  const filteredNews = useMemo(() => {
    if (activeCategory === "Todas") return categorizedNews;

    return categorizedNews.filter(
      (item) => item.detectedCategory === activeCategory
    );
  }, [categorizedNews, activeCategory]);

  const featuredNews = filteredNews[0];
  const remainingNews = filteredNews.slice(1);

  return (
    <main className="radar-page">
      <header className="radar-header">
        <div className="radar-header-inner">
          <span className="radar-eyebrow">ILUME TECH JOURNAL</span>

          <h1>
            Radar <span>Tech.</span>
          </h1>

          <p>
            O universo Apple, acompanhado de perto.
            Notícias, novidades e inovação em um só lugar.
          </p>

          <div className="radar-header-bottom">
            <span>APPLE · TECNOLOGIA · INOVAÇÃO</span>

            <button
              className="radar-refresh"
              onClick={loadNews}
              disabled={loading}
              type="button"
            >
              <RefreshCw size={15} />
              Atualizar
            </button>
          </div>
        </div>
      </header>

      <section className="radar-content">
        <nav className="radar-categories" aria-label="Categorias de notícias">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={activeCategory === category ? "active" : ""}
              aria-pressed={activeCategory === category}
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </button>
          ))}
        </nav>

        {loading && (
          <div className="radar-message">
            Carregando notícias...
          </div>
        )}

        {!loading && error && (
          <div className="radar-message">
            <p>{error}</p>
            <button type="button" onClick={loadNews}>
              Tentar novamente
            </button>
          </div>
        )}

        {!loading && !error && filteredNews.length === 0 && (
          <div className="radar-message">
            Nenhuma notícia encontrada nesta categoria.
          </div>
        )}

        {!loading && !error && featuredNews && (
          <>
            <section className="radar-featured">
              {featuredNews.image_url && (
                <a
                  href={featuredNews.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="radar-featured-image"
                >
                  <img
                    src={featuredNews.image_url}
                    alt={featuredNews.title}
                  />
                </a>
              )}

              <div className="radar-featured-content">
                <span className="radar-featured-label">
                  DESTAQUE · {featuredNews.detectedCategory}
                </span>

                <h2>{featuredNews.title}</h2>

                <p>
                  {featuredNews.summary ||
                    "Confira os detalhes desta notícia na fonte original."}
                </p>

                <div className="radar-news-meta">
                  <span>{featuredNews.source}</span>
                  <span>{formatDate(featuredNews.published_at)}</span>
                </div>

                <a
                  href={featuredNews.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="radar-read-link"
                >
                  Ler matéria original
                  <ArrowUpRight size={17} />
                </a>
              </div>
            </section>

            <section className="radar-latest">
              <div className="radar-section-heading">
                <div>
                  <span>ACOMPANHE</span>
                  <h2>Últimas notícias.</h2>
                </div>

                <span>{filteredNews.length} notícias</span>
              </div>

              <div className="radar-news-grid">
                {remainingNews.map((item) => (
                  <article className="radar-news-card" key={item.id}>
                    {item.image_url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="radar-card-image"
                      >
                        <img
                          src={item.image_url}
                          alt={item.title}
                          loading="lazy"
                        />
                      </a>
                    )}

                    <div className="radar-card-content">
                      <span className="radar-card-category">
                        {item.detectedCategory}
                      </span>

                      <h3>{item.title}</h3>

                      <p>
                        {item.summary ||
                          "Acesse a fonte original para conferir todos os detalhes."}
                      </p>

                      <div className="radar-news-meta">
                        <span>{item.source}</span>
                        <span>{formatDate(item.published_at)}</span>
                      </div>

                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="radar-read-link"
                      >
                        Ler matéria
                        <ArrowUpRight size={16} />
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
