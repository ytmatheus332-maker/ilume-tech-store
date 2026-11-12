
export interface SpecItem {
  category: string;
  label: string;
  value: string;
}

export interface ProductSpecs {
  highlights: string[];
  specs: SpecItem[];
}

export interface SpecGroup {
  category: string;
  items: SpecItem[];
}

const productSpecs: Record<string, ProductSpecs> = {
  "iphone-14": {
    highlights: [
      "Tela Super Retina XDR OLED de 6,1 polegadas.",
      "Chip A15 Bionic com GPU de 5 núcleos.",
      "Sistema de câmera dupla de 12 MP.",
      "Modo Cinema e Modo Ação para vídeos.",
      "Face ID para autenticação segura.",
      "Conector Lightning e resistência IP68."
    ],
    specs: [
      { category: "Tela", label: "Tecnologia", value: "Super Retina XDR OLED" },
      { category: "Tela", label: "Tamanho", value: "6,1 polegadas" },
      { category: "Tela", label: "Resolução", value: "2532 × 1170 pixels" },
      { category: "Desempenho", label: "Processador", value: "Apple A15 Bionic" },
      { category: "Câmeras", label: "Principal", value: "12 MP" },
      { category: "Câmeras", label: "Ultra-angular", value: "12 MP" },
      { category: "Câmeras", label: "Frontal", value: "12 MP TrueDepth" },
      { category: "Segurança", label: "Autenticação", value: "Face ID" },
      { category: "Conectividade", label: "Porta", value: "Lightning" },
      { category: "Construção", label: "Proteção", value: "IP68" },
      { category: "Construção", label: "Material", value: "Alumínio e vidro" }
    ]
  },

  "iphone-14-plus": {
    highlights: [
      "Tela Super Retina XDR OLED de 6,7 polegadas.",
      "Chip A15 Bionic com GPU de 5 núcleos.",
      "Sistema de câmera dupla de 12 MP.",
      "Bateria com maior autonomia em relação ao iPhone 14.",
      "Modo Cinema e Modo Ação.",
      "Face ID e resistência IP68."
    ],
    specs: [
      { category: "Tela", label: "Tecnologia", value: "Super Retina XDR OLED" },
      { category: "Tela", label: "Tamanho", value: "6,7 polegadas" },
      { category: "Tela", label: "Resolução", value: "2778 × 1284 pixels" },
      { category: "Desempenho", label: "Processador", value: "Apple A15 Bionic" },
      { category: "Câmeras", label: "Principal", value: "12 MP" },
      { category: "Câmeras", label: "Ultra-angular", value: "12 MP" },
      { category: "Câmeras", label: "Frontal", value: "12 MP TrueDepth" },
      { category: "Segurança", label: "Autenticação", value: "Face ID" },
      { category: "Conectividade", label: "Porta", value: "Lightning" },
      { category: "Construção", label: "Proteção", value: "IP68" },
      { category: "Construção", label: "Material", value: "Alumínio e vidro" }
    ]
  },

  "iphone-14-pro": {
    highlights: [
      "Tela Super Retina XDR OLED de 6,1 polegadas.",
      "Dynamic Island e tela Sempre Ativa.",
      "ProMotion com taxa de atualização de até 120 Hz.",
      "Chip A16 Bionic.",
      "Câmera principal de 48 MP.",
      "Teleobjetiva com zoom óptico de 3x."
    ],
    specs: [
      { category: "Tela", label: "Tecnologia", value: "Super Retina XDR OLED" },
      { category: "Tela", label: "Tamanho", value: "6,1 polegadas" },
      { category: "Tela", label: "Taxa de atualização", value: "Até 120 Hz ProMotion" },
      { category: "Tela", label: "Recursos", value: "Dynamic Island e Sempre Ativa" },
      { category: "Desempenho", label: "Processador", value: "Apple A16 Bionic" },
      { category: "Câmeras", label: "Principal", value: "48 MP" },
      { category: "Câmeras", label: "Ultra-angular", value: "12 MP" },
      { category: "Câmeras", label: "Teleobjetiva", value: "12 MP com zoom óptico de 3x" },
      { category: "Câmeras", label: "Frontal", value: "12 MP TrueDepth" },
      { category: "Segurança", label: "Autenticação", value: "Face ID" },
      { category: "Conectividade", label: "Porta", value: "Lightning" },
      { category: "Construção", label: "Proteção", value: "IP68" },
      { category: "Construção", label: "Material", value: "Aço inoxidável e vidro" }
    ]
  },

  "iphone-14-pro-max": {
    highlights: [
      "Tela Super Retina XDR OLED de 6,7 polegadas.",
      "Dynamic Island e tela Sempre Ativa.",
      "ProMotion de até 120 Hz.",
      "Chip A16 Bionic.",
      "Câmera principal de 48 MP.",
      "Teleobjetiva com zoom óptico de 3x."
    ],
    specs: [
      { category: "Tela", label: "Tecnologia", value: "Super Retina XDR OLED" },
      { category: "Tela", label: "Tamanho", value: "6,7 polegadas" },
      { category: "Tela", label: "Taxa de atualização", value: "Até 120 Hz ProMotion" },
      { category: "Tela", label: "Recursos", value: "Dynamic Island e Sempre Ativa" },
      { category: "Desempenho", label: "Processador", value: "Apple A16 Bionic" },
      { category: "Câmeras", label: "Principal", value: "48 MP" },
      { category: "Câmeras", label: "Ultra-angular", value: "12 MP" },
      { category: "Câmeras", label: "Teleobjetiva", value: "12 MP com zoom óptico de 3x" },
      { category: "Câmeras", label: "Frontal", value: "12 MP TrueDepth" },
      { category: "Segurança", label: "Autenticação", value: "Face ID" },
      { category: "Conectividade", label: "Porta", value: "Lightning" },
      { category: "Construção", label: "Proteção", value: "IP68" },
      { category: "Construção", label: "Material", value: "Aço inoxidável e vidro" }
    ]
  },

  "iphone-15": {
    highlights: [
      "Tela Super Retina XDR OLED de 6,1 polegadas.",
      "Chip A16 Bionic.",
      "Câmera principal de 48 MP.",
      "Dynamic Island para acompanhar atividades.",
      "Conector USB-C.",
      "Resistência IP68."
    ],
    specs: [
      { category: "Tela", label: "Tecnologia", value: "Super Retina XDR OLED" },
      { category: "Tela", label: "Tamanho", value: "6,1 polegadas" },
      { category: "Tela", label: "Resolução", value: "2556 × 1179 pixels" },
      { category: "Desempenho", label: "Processador", value: "Apple A16 Bionic" },
      { category: "Câmeras", label: "Principal", value: "48 MP" },
      { category: "Câmeras", label: "Ultra-angular", value: "12 MP" },
      { category: "Câmeras", label: "Frontal", value: "12 MP TrueDepth" },
      { category: "Segurança", label: "Autenticação", value: "Face ID" },
      { category: "Conectividade", label: "Porta", value: "USB-C" },
      { category: "Construção", label: "Proteção", value: "IP68" },
      { category: "Construção", label: "Material", value: "Alumínio e vidro" }
    ]
  },

  "iphone-15-plus": {
    highlights: [
      "Tela Super Retina XDR OLED de 6,7 polegadas.",
      "Chip A16 Bionic.",
      "Câmera principal de 48 MP.",
      "Dynamic Island.",
      "Conector USB-C.",
      "Maior autonomia de bateria em relação ao iPhone 15."
    ],
    specs: [
      { category: "Tela", label: "Tecnologia", value: "Super Retina XDR OLED" },
      { category: "Tela", label: "Tamanho", value: "6,7 polegadas" },
      { category: "Tela", label: "Resolução", value: "2796 × 1290 pixels" },
      { category: "Desempenho", label: "Processador", value: "Apple A16 Bionic" },
      { category: "Câmeras", label: "Principal", value: "48 MP" },
      { category: "Câmeras", label: "Ultra-angular", value: "12 MP" },
      { category: "Câmeras", label: "Frontal", value: "12 MP TrueDepth" },
      { category: "Segurança", label: "Autenticação", value: "Face ID" },
      { category: "Conectividade", label: "Porta", value: "USB-C" },
      { category: "Construção", label: "Proteção", value: "IP68" },
      { category: "Construção", label: "Material", value: "Alumínio e vidro" }
    ]
  },

  "iphone-15-pro": {
    highlights: [
      "Tela Super Retina XDR OLED de 6,1 polegadas.",
      "Estrutura em titânio.",
      "Chip A17 Pro.",
      "ProMotion de até 120 Hz.",
      "Sistema de câmera Pro de 48 MP.",
      "USB-C com suporte a USB 3."
    ],
    specs: [
      { category: "Tela", label: "Tecnologia", value: "Super Retina XDR OLED" },
      { category: "Tela", label: "Tamanho", value: "6,1 polegadas" },
      { category: "Tela", label: "Taxa de atualização", value: "Até 120 Hz ProMotion" },
      { category: "Desempenho", label: "Processador", value: "Apple A17 Pro" },
      { category: "Câmeras", label: "Principal", value: "48 MP" },
      { category: "Câmeras", label: "Ultra-angular", value: "12 MP" },
      { category: "Câmeras", label: "Teleobjetiva", value: "12 MP com zoom óptico de 3x" },
      { category: "Câmeras", label: "Frontal", value: "12 MP TrueDepth" },
      { category: "Conectividade", label: "Porta", value: "USB-C com USB 3" },
      { category: "Segurança", label: "Autenticação", value: "Face ID" },
      { category: "Construção", label: "Material", value: "Titânio e vidro" },
      { category: "Construção", label: "Proteção", value: "IP68" }
    ]
  },

  "iphone-15-pro-max": {
    highlights: [
      "Tela Super Retina XDR OLED de 6,7 polegadas.",
      "Estrutura em titânio.",
      "Chip A17 Pro.",
      "ProMotion de até 120 Hz.",
      "Câmera principal de 48 MP.",
      "Teleobjetiva com zoom óptico de 5x."
    ],
    specs: [
      { category: "Tela", label: "Tecnologia", value: "Super Retina XDR OLED" },
      { category: "Tela", label: "Tamanho", value: "6,7 polegadas" },
      { category: "Tela", label: "Taxa de atualização", value: "Até 120 Hz ProMotion" },
      { category: "Desempenho", label: "Processador", value: "Apple A17 Pro" },
      { category: "Câmeras", label: "Principal", value: "48 MP" },
      { category: "Câmeras", label: "Ultra-angular", value: "12 MP" },
      { category: "Câmeras", label: "Teleobjetiva", value: "12 MP com zoom óptico de 5x" },
      { category: "Câmeras", label: "Frontal", value: "12 MP TrueDepth" },
      { category: "Conectividade", label: "Porta", value: "USB-C com USB 3" },
      { category: "Segurança", label: "Autenticação", value: "Face ID" },
      { category: "Construção", label: "Material", value: "Titânio e vidro" },
      { category: "Construção", label: "Proteção", value: "IP68" }
    ]
  },

  "iphone-16": {
    highlights: [
      "Tela Super Retina XDR OLED de 6,1 polegadas.",
      "Chip Apple A18.",
      "Sistema de câmera Fusion de 48 MP.",
      "Controle da Câmera.",
      "Botão de Ação personalizável.",
      "Compatibilidade com Apple Intelligence."
    ],
    specs: [
      { category: "Tela", label: "Tecnologia", value: "Super Retina XDR OLED" },
      { category: "Tela", label: "Tamanho", value: "6,1 polegadas" },
      { category: "Tela", label: "Resolução", value: "2556 × 1179 pixels" },
      { category: "Desempenho", label: "Processador", value: "Apple A18" },
      { category: "Câmeras", label: "Principal Fusion", value: "48 MP" },
      { category: "Câmeras", label: "Ultra-angular", value: "12 MP" },
      { category: "Câmeras", label: "Frontal", value: "12 MP TrueDepth" },
      { category: "Recursos", label: "Controles", value: "Controle da Câmera e Botão de Ação" },
      { category: "Recursos", label: "Inteligência artificial", value: "Apple Intelligence" },
      { category: "Conectividade", label: "Porta", value: "USB-C" },
      { category: "Segurança", label: "Autenticação", value: "Face ID" },
      { category: "Construção", label: "Proteção", value: "IP68" }
    ]
  },

  "iphone-16-plus": {
    highlights: [
      "Tela Super Retina XDR OLED de 6,7 polegadas.",
      "Chip Apple A18.",
      "Câmera Fusion de 48 MP.",
      "Controle da Câmera e Botão de Ação.",
      "Compatibilidade com Apple Intelligence.",
      "Maior autonomia de bateria em relação ao iPhone 16."
    ],
    specs: [
      { category: "Tela", label: "Tecnologia", value: "Super Retina XDR OLED" },
      { category: "Tela", label: "Tamanho", value: "6,7 polegadas" },
      { category: "Tela", label: "Resolução", value: "2796 × 1290 pixels" },
      { category: "Desempenho", label: "Processador", value: "Apple A18" },
      { category: "Câmeras", label: "Principal Fusion", value: "48 MP" },
      { category: "Câmeras", label: "Ultra-angular", value: "12 MP" },
      { category: "Câmeras", label: "Frontal", value: "12 MP TrueDepth" },
      { category: "Recursos", label: "Controles", value: "Controle da Câmera e Botão de Ação" },
      { category: "Recursos", label: "Inteligência artificial", value: "Apple Intelligence" },
      { category: "Conectividade", label: "Porta", value: "USB-C" },
      { category: "Segurança", label: "Autenticação", value: "Face ID" },
      { category: "Construção", label: "Proteção", value: "IP68" }
    ]
  },

  "iphone-16-pro": {
    highlights: [
      "Tela Super Retina XDR OLED de 6,3 polegadas.",
      "ProMotion de até 120 Hz.",
      "Chip Apple A18 Pro.",
      "Sistema de câmeras Pro de 48 MP.",
      "Ultra-angular de 48 MP e teleobjetiva de 5x.",
      "Estrutura em titânio."
    ],
    specs: [
      { category: "Tela", label: "Tecnologia", value: "Super Retina XDR OLED" },
      { category: "Tela", label: "Tamanho", value: "6,3 polegadas" },
      { category: "Tela", label: "Taxa de atualização", value: "Até 120 Hz ProMotion" },
      { category: "Desempenho", label: "Processador", value: "Apple A18 Pro" },
      { category: "Câmeras", label: "Principal Fusion", value: "48 MP" },
      { category: "Câmeras", label: "Ultra-angular", value: "48 MP" },
      { category: "Câmeras", label: "Teleobjetiva", value: "12 MP com zoom óptico de 5x" },
      { category: "Câmeras", label: "Frontal", value: "12 MP TrueDepth" },
      { category: "Recursos", label: "Controles", value: "Controle da Câmera e Botão de Ação" },
      { category: "Conectividade", label: "Porta", value: "USB-C com USB 3" },
      { category: "Segurança", label: "Autenticação", value: "Face ID" },
      { category: "Construção", label: "Material", value: "Titânio e vidro" },
      { category: "Construção", label: "Proteção", value: "IP68" }
    ]
  },

  "iphone-16-pro-max": {
    highlights: [
      "Tela Super Retina XDR OLED de 6,9 polegadas.",
      "ProMotion de até 120 Hz.",
      "Chip Apple A18 Pro.",
      "Sistema de câmeras Pro de 48 MP.",
      "Ultra-angular de 48 MP e teleobjetiva de 5x.",
      "Estrutura em titânio e bateria de longa duração."
    ],
    specs: [
      { category: "Tela", label: "Tecnologia", value: "Super Retina XDR OLED" },
      { category: "Tela", label: "Tamanho", value: "6,9 polegadas" },
      { category: "Tela", label: "Taxa de atualização", value: "Até 120 Hz ProMotion" },
      { category: "Desempenho", label: "Processador", value: "Apple A18 Pro" },
      { category: "Câmeras", label: "Principal Fusion", value: "48 MP" },
      { category: "Câmeras", label: "Ultra-angular", value: "48 MP" },
      { category: "Câmeras", label: "Teleobjetiva", value: "12 MP com zoom óptico de 5x" },
      { category: "Câmeras", label: "Frontal", value: "12 MP TrueDepth" },
      { category: "Recursos", label: "Controles", value: "Controle da Câmera e Botão de Ação" },
      { category: "Conectividade", label: "Porta", value: "USB-C com USB 3" },
      { category: "Segurança", label: "Autenticação", value: "Face ID" },
      { category: "Construção", label: "Material", value: "Titânio e vidro" },
      { category: "Construção", label: "Proteção", value: "IP68" }
    ]
  },

  "iphone-17": {
    highlights: [
      "Tela Super Retina XDR OLED de 6,3 polegadas.",
      "ProMotion com taxa de atualização de até 120 Hz.",
      "Chip Apple A19.",
      "Sistema de câmera Fusion de 48 MP.",
      "Câmera frontal Center Stage de 18 MP.",
      "Conector USB-C e Apple Intelligence."
    ],
    specs: [
      { category: "Tela", label: "Tecnologia", value: "Super Retina XDR OLED" },
      { category: "Tela", label: "Tamanho", value: "6,3 polegadas" },
      { category: "Tela", label: "Taxa de atualização", value: "Até 120 Hz ProMotion" },
      { category: "Desempenho", label: "Processador", value: "Apple A19" },
      { category: "Câmeras", label: "Principal Fusion", value: "48 MP" },
      { category: "Câmeras", label: "Ultra-angular", value: "48 MP" },
      { category: "Câmeras", label: "Frontal", value: "18 MP Center Stage" },
      { category: "Recursos", label: "Inteligência artificial", value: "Apple Intelligence" },
      { category: "Conectividade", label: "Porta", value: "USB-C" },
      { category: "Segurança", label: "Autenticação", value: "Face ID" },
      { category: "Construção", label: "Proteção", value: "IP68" }
    ]
  },

  "iphone-17-pro": {
    highlights: [
      "Tela Super Retina XDR OLED de 6,3 polegadas.",
      "ProMotion de até 120 Hz.",
      "Chip Apple A19 Pro.",
      "Sistema de câmeras Pro de 48 MP.",
      "Teleobjetiva com zoom óptico de até 8x.",
      "Câmera frontal Center Stage de 18 MP."
    ],
    specs: [
      { category: "Tela", label: "Tecnologia", value: "Super Retina XDR OLED" },
      { category: "Tela", label: "Tamanho", value: "6,3 polegadas" },
      { category: "Tela", label: "Taxa de atualização", value: "Até 120 Hz ProMotion" },
      { category: "Desempenho", label: "Processador", value: "Apple A19 Pro" },
      { category: "Câmeras", label: "Principal", value: "48 MP" },
      { category: "Câmeras", label: "Ultra-angular", value: "48 MP" },
      { category: "Câmeras", label: "Teleobjetiva", value: "48 MP com zoom óptico de até 8x" },
      { category: "Câmeras", label: "Frontal", value: "18 MP Center Stage" },
      { category: "Recursos", label: "Inteligência artificial", value: "Apple Intelligence" },
      { category: "Conectividade", label: "Porta", value: "USB-C" },
      { category: "Segurança", label: "Autenticação", value: "Face ID" },
      { category: "Construção", label: "Proteção", value: "IP68" }
    ]
  },

  "star-link": {
    highlights: [
      "Internet via satélite para locais com cobertura limitada.",
      "Design compacto e portátil.",
      "Wi-Fi integrado.",
      "Instalação com visão desobstruída do céu.",
      "Conexão sujeita à disponibilidade do serviço Starlink.",
      "Ideal para uso residencial, viagens e locais remotos."
    ],
    specs: [
      { category: "Produto", label: "Modelo", value: "Starlink Mini UTA-231" },
      { category: "Conectividade", label: "Tecnologia", value: "Internet via satélite" },
      { category: "Conectividade", label: "Wi-Fi", value: "Roteador integrado" },
      { category: "Instalação", label: "Posicionamento", value: "Área com visão desobstruída do céu" },
      { category: "Alimentação", label: "Fonte de energia", value: "Conforme kit e versão comercializada" },
      { category: "Serviço", label: "Ativação", value: "Plano Starlink necessário" }
    ]
  }
};

export function getProductSpecs(slug: string): ProductSpecs | null {
  return productSpecs[slug] ?? null;
}

export function groupSpecs(specs: SpecItem[]): SpecGroup[] {
  const groups: SpecGroup[] = [];

  for (const spec of specs) {
    const existing = groups.find(
      (group) => group.category === spec.category
    );

    if (existing) {
      existing.items.push(spec);
    } else {
      groups.push({
        category: spec.category,
        items: [spec]
      });
    }
  }

  return groups;
}
