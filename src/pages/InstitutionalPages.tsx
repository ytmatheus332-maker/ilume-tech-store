import { Link } from "react-router-dom";
import "./InstitutionalPages.css";

export type InstitutionalPageId =
  | "terms"
  | "privacy"
  | "cookies"
  | "delivery"
  | "returns"
  | "warranty";

type LegalSection = { title: string; paragraphs?: string[]; bullets?: string[] };
type LegalPageContent = { eyebrow: string; title: string; intro: string; sections: LegalSection[]; references?: { label: string; href: string }[] };

const CDC = "https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm";
const ECOMMERCE_DECREE = "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm";
const ANPD_COOKIES = "https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_cookies_e_protecao_de_dados_pessoais";
const ANPD_RIGHTS = "https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares";

const pages: Record<InstitutionalPageId, LegalPageContent> = {
  terms: {
    eyebrow: "INFORMAÇÕES INSTITUCIONAIS",
    title: "Termos de Uso",
    intro: "Estes termos apresentam as condições gerais de navegação e compra na ILUME Tech Store. Leia também as políticas de entrega, trocas, garantia, privacidade e cookies, disponíveis ao final desta página.",
    sections: [
      { title: "Identificação da loja", paragraphs: ["A loja é operada por ILUME ACESSORIOS, nome fantasia ILUME, pessoa jurídica inscrita no CNPJ 00.623.904/0003-35, com endereço na Av. São Paulo, 743 - Centro, Maringá - PR, 87020-035, Brasil. Site: https://ilume-tech-store.vercel.app/.", "Canal de atendimento informado: suporteilumeonline@gmail.com. O atendimento humano ocorre de segunda a sexta-feira, das 12h às 18h, no horário de Brasília."] },
      { title: "Navegação e informações da oferta", paragraphs: ["As informações sobre produtos, variantes, disponibilidade, preço, forma de pagamento e condições da oferta devem ser conferidas na página do produto e antes da finalização do pedido. O resumo apresentado no fechamento da compra deve permitir a conferência dos dados antes da confirmação.", "A ILUME busca manter as informações da loja claras e atualizadas. Em caso de divergência percebida antes da compra, contate o suporte para esclarecimento."] },
      { title: "Pedidos e pagamento", paragraphs: ["As opções e condições de pagamento disponíveis são apresentadas durante a compra. O checkout pode utilizar o provedor de pagamento habilitado para a loja; a confirmação e o processamento dependem das informações exibidas no fluxo do pedido.", "Este documento não cria prazos de processamento, condições de parcelamento ou meios de pagamento além daqueles efetivamente mostrados no checkout."] },
      { title: "Entrega, devolução e garantia", paragraphs: ["As entregas são realizadas somente no território brasileiro, com prazo de até 45 dias. O prazo aplicável ao pedido deve ser informado de maneira clara na oferta ou durante a contratação.", "O direito de arrependimento, as solicitações de troca ou devolução e a garantia são tratados conforme a legislação aplicável e as páginas específicas desta loja. Nenhum termo deste documento limita direitos previstos em lei."] },
      { title: "Atualizações", paragraphs: ["Estes termos podem ser atualizados para refletir mudanças na loja ou nas informações operacionais. A versão vigente ficará disponível nesta rota. Alterações não retiram direitos já assegurados ao consumidor."] },
    ],
    references: [{ label: "Decreto nº 7.962/2013 — comércio eletrônico", href: ECOMMERCE_DECREE }],
  },
  privacy: {
    eyebrow: "PROTEÇÃO DE DADOS",
    title: "Política de Privacidade",
    intro: "Esta política descreve, em linguagem direta, os dados tratados nas funções atuais da loja e os controles disponíveis. O conteúdo foi preparado com base no código e nos dados fornecidos pela ILUME e precisa de revisão jurídica e operacional antes da publicação definitiva.",
    sections: [
      { title: "Quem opera a loja", paragraphs: ["A loja é operada por ILUME ACESSORIOS (ILUME), CNPJ 00.623.904/0003-35, no endereço Av. São Paulo, 743 - Centro, Maringá - PR, 87020-035, Brasil. Site: https://ilume-tech-store.vercel.app/.", "O canal de suporte informado para contato é suporteilumeonline@gmail.com. A ILUME não forneceu nesta etapa a identificação de um encarregado de dados nem um canal dedicado de privacidade; o e-mail de suporte não é apresentado aqui como contato de encarregado formalmente designado."] },
      { title: "Dados tratados nas funções da loja", paragraphs: ["Conforme as informações digitadas pelo usuário, as funções atuais podem tratar dados de acesso à conta, como e-mail; dados necessários ao pedido, como nome, e-mail, telefone, CPF informado no checkout, nome e telefone do destinatário e endereço de entrega; além dos itens, variantes, quantidades e identificadores do pedido.", "O carrinho e identificadores técnicos de continuidade do checkout são guardados no armazenamento local ou de sessão do navegador. O cliente Supabase também gerencia a sessão de autenticação. Esses mecanismos de armazenamento do navegador não são, por si só, cookies de publicidade."] },
      { title: "Finalidades e operações", paragraphs: ["Os dados são utilizados para disponibilizar a conta, manter o carrinho, processar o checkout, registrar e acompanhar pedidos, permitir o pagamento e viabilizar a comunicação de suporte relacionada à compra.", "O código da loja integra Supabase para autenticação e acesso aos dados do serviço. O checkout possui integrações com BravoPay e Mercado Pago; qual provedor é utilizado depende da configuração vigente. A hospedagem e publicação do site utilizam Vercel. O CSS atual também solicita a família tipográfica Inter ao Google Fonts. A identificação contratual completa dos operadores, os dados enviados a cada um, os prazos de retenção e eventuais transferências internacionais devem ser confirmados pela ILUME antes da publicação definitiva desta política."] },
      { title: "Cookies e tecnologias semelhantes", paragraphs: ["Na auditoria desta versão não foram encontrados scripts explícitos de Meta Pixel, Google Analytics, Google Ads ou Google Tag Manager, nem código próprio que leia ou grave cookies via document.cookie. A loja utiliza armazenamento local e de sessão para recursos essenciais e para registrar suas preferências de cookies.", "Categorias de análise e publicidade permanecem desativadas até escolha válida. A ILUME ainda não informou ferramentas futuras como instaladas. Consulte a Política de Cookies para detalhes."] },
      { title: "Compartilhamento e conservação", paragraphs: ["Quando necessário às funções solicitadas, dados podem trafegar entre os serviços integrados da loja descritos nesta política, conforme o recurso utilizado. Esta página não afirma prazos específicos de retenção, locais de armazenamento ou finalidades adicionais que ainda não foram confirmados.", "Os dados são mantidos pelo tempo necessário para operar a relação com o consumidor e atender obrigações aplicáveis. Os períodos e critérios concretos de retenção precisam ser validados e detalhados pela ILUME antes da publicação definitiva."] },
      { title: "Direitos do titular", bullets: ["Confirmar a existência de tratamento e obter acesso aos dados.", "Solicitar correção de dados incompletos, inexatos ou desatualizados.", "Solicitar anonimização, bloqueio ou eliminação quando cabível.", "Solicitar informações sobre compartilhamentos e sobre a possibilidade de não fornecer consentimento, quando aplicável.", "Revogar consentimento e solicitar portabilidade nos termos e limites legais."], paragraphs: ["Para encaminhar uma solicitação, escreva para suporteilumeonline@gmail.com. A ILUME poderá solicitar informações estritamente necessárias para localizar e proteger a solicitação. O titular também pode apresentar petição à ANPD conforme os procedimentos da Autoridade."] },
      { title: "Revisão desta política", paragraphs: ["Esta política não constitui certificação de conformidade jurídica. Antes da publicação definitiva, a ILUME deve confirmar os papéis dos fornecedores integrados, as bases legais aplicáveis a cada operação, os critérios de retenção, o canal de privacidade e a identificação do encarregado, quando aplicável."] },
    ],
    references: [{ label: "LGPD — direitos dos titulares na ANPD", href: ANPD_RIGHTS }],
  },
  cookies: {
    eyebrow: "PRIVACIDADE ILUME",
    title: "Política de Cookies",
    intro: "Esta política explica o uso atual de cookies e de tecnologias semelhantes, como armazenamento local e de sessão do navegador. Ela será atualizada se novas ferramentas forem incorporadas.",
    sections: [
      { title: "O que encontramos nesta versão", paragraphs: ["A revisão do código não encontrou cookies explícitos criados por scripts próprios nem ferramentas de análise ou publicidade, como Meta Pixel, Google Analytics, Google Ads ou Google Tag Manager.", "A loja usa localStorage para manter o carrinho e um identificador técnico de continuidade do checkout; usa sessionStorage como alternativa temporária para esse identificador. O cliente de autenticação Supabase mantém o estado de sessão pelo mecanismo de armazenamento do navegador configurado pela biblioteca. A preferência de cookies fica em localStorage com versão e data/hora da escolha.", "O CSS também solicita a fonte Inter ao Google Fonts. Trata-se de uma requisição de recurso remoto, não de um script de análise identificado nesta auditoria. O tratamento de dados e cookies do fornecedor externo precisa ser confirmado antes da publicação definitiva.", "Esses dados locais não são descritos como cookies quando não são cookies. O banner também pode ser usado para administrar tecnologias opcionais futuras, que não estão instaladas nesta versão."] },
      { title: "Categorias", bullets: ["Necessários — sempre ativos; sustentam o funcionamento, a segurança e o registro das preferências.", "Funcionais — opcionais; só poderão ser usados se recursos funcionais adicionais forem incorporados e houver escolha positiva.", "Analíticos — opcionais; nenhuma ferramenta analítica está instalada nesta versão.", "Publicidade e marketing — opcionais; nenhum pixel ou script publicitário está instalado nesta versão."] },
      { title: "Como escolher", paragraphs: ["No banner, você pode aceitar todos, rejeitar os não essenciais ou personalizar as categorias. As categorias opcionais começam desativadas; nenhuma opção opcional é pré-selecionada.", "A escolha fica registrada neste navegador junto da versão da política e do horário do registro. Se a versão da política mudar, a loja poderá solicitar uma nova escolha. A exclusão dos dados do navegador também apaga a preferência salva."] },
      { title: "Como alterar ou revogar", paragraphs: ["Use o link “Preferências de cookies” no rodapé para reabrir o painel e salvar uma escolha diferente. Você também pode remover os dados locais nas configurações do navegador; nesse caso, a loja poderá apresentar o banner novamente."] },
      { title: "Ferramentas futuras", paragraphs: ["Meta Pixel, Google Analytics, Google Ads e Google Tag Manager são possibilidades futuras, não integrações ativas identificadas nesta auditoria. Se alguma ferramenta opcional for adicionada, sua finalidade, fornecedor, tecnologias usadas e duração deverão ser descritos antes da ativação; ela deverá respeitar a categoria consentida."] },
      { title: "Contato", paragraphs: ["Para dúvidas sobre esta política ou sobre suas preferências, escreva para suporteilumeonline@gmail.com. Atendimento humano: segunda a sexta-feira, das 12h às 18h, horário de Brasília."] },
    ],
    references: [{ label: "Guia da ANPD sobre cookies e proteção de dados", href: ANPD_COOKIES }],
  },
  delivery: {
    eyebrow: "ENTREGA E FRETE",
    title: "Entrega e frete",
    intro: "As entregas da ILUME são realizadas exclusivamente no território brasileiro.",
    sections: [
      { title: "Prazo de entrega", paragraphs: ["O prazo máximo informado pela ILUME é de até 45 dias. O prazo aplicável à compra deve ser apresentado de forma clara ao consumidor na oferta ou antes da confirmação do pedido.", "Confira o prazo específico informado durante a compra e na confirmação do pedido. Esta política não converte o prazo para dias úteis ou corridos, pois essa definição operacional não foi fornecida."] },
      { title: "Frete e acompanhamento", paragraphs: ["O valor do frete, a modalidade de envio, a transportadora e as informações de acompanhamento devem ser consultados nos dados efetivamente apresentados para cada pedido. A ILUME não forneceu uma regra geral de frete grátis, uma transportadora única nem um prazo geral de postagem; por isso, esta política não presume essas condições."] },
      { title: "Endereço e suporte", paragraphs: ["Informe e revise o endereço de entrega antes de finalizar o pedido. Para dúvidas sobre uma compra ou uma entrega, contate suporteilumeonline@gmail.com, de segunda a sexta-feira, das 12h às 18h, horário de Brasília."] },
      { title: "Atraso ou não entrega", paragraphs: ["Se o pedido não chegar no prazo informado, entre em contato pelo e-mail de suporte para que a situação seja verificada. Os direitos do consumidor previstos na legislação permanecem preservados."] },
    ],
    references: [{ label: "Decreto nº 7.962/2013 — informações de prazo e cumprimento da oferta", href: ECOMMERCE_DECREE }],
  },
  returns: {
    eyebrow: "ATENDIMENTO AO CONSUMIDOR",
    title: "Trocas e devoluções",
    intro: "Esta política apresenta os canais de solicitação e preserva os direitos previstos na legislação brasileira. Não cria condições de troca ou devolução além das informações confirmadas pela ILUME.",
    sections: [
      { title: "Direito de arrependimento", paragraphs: ["Nas compras realizadas fora do estabelecimento comercial, incluindo compras pela internet, o consumidor pode exercer o direito de arrependimento no prazo de 7 dias, contado da assinatura do contrato ou do recebimento do produto, conforme aplicável.", "Para solicitar, envie uma mensagem para suporteilumeonline@gmail.com informando que deseja exercer o direito de arrependimento e identificando o pedido. A ILUME confirmará o recebimento e fornecerá as instruções necessárias. O exercício do direito legal não depende de justificativa e não pode ser condicionado a uma exigência que reduza esse direito."] },
      { title: "Devolução e reembolso", paragraphs: ["Quando o direito de arrependimento for exercido, os valores pagos durante o prazo legal devem ser devolvidos conforme a legislação aplicável. O Decreto nº 7.962/2013 prevê que o exercício seja comunicado imediatamente ao meio de pagamento para impedir o lançamento ou viabilizar o estorno, conforme o caso.", "A ILUME deve informar ao consumidor o procedimento de devolução aplicável ao pedido. Esta página não fixa transportadora, custo ou prazo operacional de postagem que não tenha sido confirmado; tais orientações não podem restringir direitos legais."] },
      { title: "Troca por outros motivos", paragraphs: ["Solicitações de troca por preferência, cor ou outro motivo após o prazo legal devem ser encaminhadas ao suporte para análise conforme a situação e as regras aplicáveis. A ILUME não forneceu uma política comercial adicional de troca nesta etapa; nenhum direito legal relacionado a defeito ou vício é afetado por essa ausência."] },
      { title: "Produto com vício ou divergência", paragraphs: ["Se o produto apresentar vício ou não corresponder à oferta, contate suporteilumeonline@gmail.com com a descrição do ocorrido e os dados necessários para localizar o pedido. Os direitos e prazos previstos no Código de Defesa do Consumidor permanecem preservados."] },
      { title: "Atendimento", paragraphs: ["Canal: suporteilumeonline@gmail.com. Atendimento humano: segunda a sexta-feira, das 12h às 18h, horário de Brasília."] },
    ],
    references: [{ label: "Código de Defesa do Consumidor — art. 49", href: CDC }, { label: "Decreto nº 7.962/2013 — arrependimento no comércio eletrônico", href: ECOMMERCE_DECREE }],
  },
  warranty: {
    eyebrow: "SUPORTE E GARANTIA",
    title: "Garantia",
    intro: "A ILUME informa garantia de 3 meses para os produtos. Esse prazo não elimina, reduz ou substitui os direitos de garantia legal previstos na legislação brasileira.",
    sections: [
      { title: "Garantia informada pela ILUME", paragraphs: ["A informação operacional fornecida pela ILUME indica o período de 3 meses. As condições detalhadas, abrangência, início de contagem e procedimento específico não foram fornecidos para esta etapa e devem ser confirmados pela empresa e informados no termo aplicável ao produto."] },
      { title: "Garantia legal", paragraphs: ["A garantia legal independe de termo expresso. Para produtos duráveis, o Código de Defesa do Consumidor prevê prazo de 90 dias para reclamar de vícios aparentes ou de fácil constatação, contado da entrega efetiva. No caso de vício oculto, a contagem começa quando o problema fica evidenciado.", "A garantia contratual, quando oferecida, é complementar à garantia legal. A garantia informada de 3 meses não deve ser interpretada como renúncia ou redução dos direitos legais."] },
      { title: "Como solicitar atendimento", paragraphs: ["Entre em contato com suporteilumeonline@gmail.com, informando o número do pedido, o produto e uma descrição do problema. O atendimento humano ocorre de segunda a sexta-feira, das 12h às 18h, horário de Brasília. A ILUME informará os próximos passos aplicáveis após analisar a solicitação."] },
      { title: "Revisão de condições", paragraphs: ["Antes da publicação definitiva, a ILUME deve confirmar o termo escrito de garantia, as condições específicas por produto e o procedimento operacional de atendimento, sem prejuízo dos direitos previstos no Código de Defesa do Consumidor."] },
    ],
    references: [{ label: "Código de Defesa do Consumidor — arts. 26 e 50", href: CDC }],
  },
};

const pageNavigation: [InstitutionalPageId, string, string][] = [
  ["terms", "Termos de Uso", "/termos-de-uso"],
  ["privacy", "Privacidade", "/politica-de-privacidade"],
  ["cookies", "Cookies", "/politica-de-cookies"],
  ["delivery", "Entrega e frete", "/entrega-e-frete"],
  ["returns", "Trocas e devoluções", "/trocas-e-devolucoes"],
  ["warranty", "Garantia", "/garantia"],
];

export default function InstitutionalPage({ page }: { page: InstitutionalPageId }) {
  const content = pages[page];

  return (
    <>
      <main className="institutional-page">
        <header className="institutional-hero">
          <span className="institutional-eyebrow">{content.eyebrow}</span>
          <h1>{content.title}</h1>
          <p>{content.intro}</p>
        </header>

        <nav className="institutional-nav" aria-label="Páginas institucionais">
          {pageNavigation.map(([id, label, path]) => (
            <Link key={id} to={path} aria-current={page === id ? "page" : undefined} className={page === id ? "is-current" : ""}>{label}</Link>
          ))}
        </nav>

        <p className="institutional-review-note">Conteúdo elaborado a partir das informações fornecidas e da implementação atual. Requer revisão jurídica e confirmação operacional antes da publicação definitiva.</p>

        <div className="institutional-sections">
          {content.sections.map((section) => (
            <section className="institutional-section" key={section.title}>
              <h2>{section.title}</h2>
              {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.bullets && <ul>{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul>}
            </section>
          ))}
        </div>

        {content.references && (
          <aside className="institutional-references">
            <h2>Referências oficiais</h2>
            {content.references.map((reference) => <a key={reference.href} href={reference.href} target="_blank" rel="noreferrer">{reference.label}</a>)}
          </aside>
        )}
      </main>
    </>
  );
}
