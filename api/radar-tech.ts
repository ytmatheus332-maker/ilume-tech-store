
const FEEDS = [
  {
    url: "https://www.apple.com/newsroom/rss-feed.rss",
    source: "Apple Newsroom",
  },
  {
    url: "https://developer.apple.com/news/rss/news.rss",
    source: "Apple Developer",
  },
  {
    url: "https://feeds.macrumors.com/MacRumors-All",
    source: "MacRumors",
  },
];

interface NewsItem {
  title: string;
  summary: string;
  url: string;
  source: string;
  category: string;
  image_url: string | null;
  published_at: string;
}

function decode(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function getTag(xml: string, tag: string) {
  const match = xml.match(
    new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")
  );

  return match ? decode(match[1]) : "";
}

function cleanText(value: string) {
  return decode(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function getImage(item: string) {
  const media =
    item.match(/<media:content[^>]+url=["']([^"']+)["']/i) ||
    item.match(/<enclosure[^>]+url=["']([^"']+)["']/i) ||
    item.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);

  if (media) return media[1];

  const html = getTag(item, "description");
  const image = html.match(/<img[^>]+src=["']([^"']+)["']/i);

  return image ? image[1] : null;
}

// TRADUÇÃO AUTOMÁTICA PARA PORTUGUÊS

async function translateText(value: string): Promise<string> {
  const text = cleanText(value);

  if (!text) return "";

  try {
    const url =
      "https://translate.googleapis.com/translate_a/single" +
      "?client=gtx&sl=auto&tl=pt&dt=t&q=" +
      encodeURIComponent(text);

    const response = await fetch(url);

    if (!response.ok) {
      console.error("Serviço de tradução indisponível.");
      return text;
    }

    const result = await response.json();

    const translated = Array.isArray(result?.[0])
      ? result[0]
          .map((part: any) => part?.[0] || "")
          .join("")
      : "";

    return translated.trim() || text;
  } catch (error) {
    console.error("Erro na tradução:", error);
    return text;
  }
}

// LEITURA DOS FEEDS RSS

function getItems(xml: string, source: string): NewsItem[] {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];

  return items
    .map((item) => {
      const title = getTag(item, "title");
      const link = getTag(item, "link");
      const description = getTag(item, "description");
      const date = getTag(item, "pubDate");

      const parsedDate = date ? new Date(date) : new Date();

      return {
        title,
        summary: cleanText(description),
        url: link,
        source,
        category: "Apple News",
        image_url: getImage(item),
        published_at: Number.isNaN(parsedDate.getTime())
          ? new Date().toISOString()
          : parsedDate.toISOString(),
      };
    })
    .filter((item) => item.title && item.url);
}

// TRADUZ AS NOTÍCIAS EM PEQUENOS LOTES

async function translateNews(news: NewsItem[]) {
  const translatedNews: NewsItem[] = [];
  const batchSize = 5;

  for (let i = 0; i < news.length; i += batchSize) {
    const batch = news.slice(i, i + batchSize);

    const translatedBatch = await Promise.all(
      batch.map(async (item) => {
        const [title, summary] = await Promise.all([
          translateText(item.title),
          translateText(item.summary),
        ]);

        return {
          ...item,
          title,
          summary,
        };
      })
    );

    translatedNews.push(...translatedBatch);
  }

  return translatedNews;
}

// FUNÇÃO PRINCIPAL DA API

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Método não permitido.",
    });
  }

  const cronSecret = process.env.CRON_SECRET;

  if (
    !cronSecret ||
    req.headers.authorization !== `Bearer ${cronSecret}`
  ) {
    return res.status(401).json({
      error: "Não autorizado.",
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error: "Configuração do Supabase incompleta.",
    });
  }

  try {
    // BUSCAR NOTÍCIAS

    const results = await Promise.allSettled(
      FEEDS.map(async (feed) => {
        const response = await fetch(feed.url);

        if (!response.ok) {
          throw new Error(`Falha ao consultar ${feed.source}`);
        }

        const xml = await response.text();

        return getItems(xml, feed.source);
      })
    );

    const news = results
      .filter((result) => result.status === "fulfilled")
      .flatMap((result: any) => result.value)
      .filter((item: NewsItem) => {
        try {
          return new URL(item.url).protocol === "https:";
        } catch {
          return false;
        }
      });

    if (news.length === 0) {
      return res.status(502).json({
        error: "Nenhuma notícia foi recebida das fontes.",
      });
    }

    // TRADUZIR PARA PORTUGUÊS BRASILEIRO

    const translatedNews = await translateNews(news);

    // SALVAR E ATUALIZAR NO SUPABASE

    const databaseResponse = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/radar_tech_news?on_conflict=url`,
      {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(translatedNews),
      }
    );

    if (!databaseResponse.ok) {
      const error = await databaseResponse.text();
      throw new Error(error);
    }

    return res.status(200).json({
      success: true,
      received: news.length,
      translated: translatedNews.length,
      message: "Radar Tech atualizado em português brasileiro.",
    });
  } catch (error) {
    console.error("Erro no Radar Tech:", error);

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Erro ao atualizar notícias.",
    });
  }
}
