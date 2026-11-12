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

// Dados complementares por slug. Produtos sem entrada aqui não exibem
// as seções de diferenciais e ficha técnica na página de detalhes.
const productSpecs: Record<string, ProductSpecs> = {
  "iphone-15": {
    highlights: [
      "Tela Super Retina XDR OLED de 6,1 polegadas.",
      "Chip A16 Bionic para desempenho e eficiência.",
      "Câmera principal de 48 MP com alta resolução.",
      "Dynamic Island para acompanhar atividades em tempo real.",
      "Conexão USB-C universal.",
      "Resistência IP68 contra água e poeira.",
    ],
    specs: [
      { category: "Tela", label: "Tecnologia", value: "Super Retina XDR OLED" },
      { category: "Tela", label: "Tamanho", value: "6,1 polegadas" },
      { category: "Desempenho", label: "Processador", value: "Apple A16 Bionic" },
      { category: "Câmeras", label: "Principal", value: "48 MP" },
      { category: "Conectividade", label: "Porta", value: "USB-C" },
    ],
  },
  "iphone-16": {
    highlights: [
      "Tela Super Retina XDR OLED de 6,1 polegadas.",
      "Chip Apple A18 de última geração.",
      "Sistema de câmera Fusion de 48 MP.",
      "Controle da Câmera para capturas rápidas.",
      "Compatível com Apple Intelligence.",
      "Conexão USB-C e corpo em alumínio aeroespacial.",
    ],
    specs: [
      { category: "Tela", label: "Tecnologia", value: "Super Retina XDR OLED" },
      { category: "Tela", label: "Tamanho", value: "6,1 polegadas" },
      { category: "Desempenho", label: "Processador", value: "Apple A18" },
      { category: "Câmeras", label: "Principal Fusion", value: "48 MP" },
      { category: "Conectividade", label: "Porta", value: "USB-C" },
    ],
  },
  "iphone-16-pro": {
    highlights: [
      "Tela Super Retina XDR OLED de 6,3 polegadas.",
      "Tecnologia ProMotion de até 120 Hz.",
      "Chip Apple A18 Pro com desempenho profissional.",
      "Sistema de câmera Pro com principal de 48 MP e Ultra-angular.",
      "Teleobjetiva de 5x para zoom de alta precisão.",
      "Acabamento premium em titânio leve e resistente.",
    ],
    specs: [
      {
        category: "Tela",
        label: "Tecnologia",
        value: "Super Retina XDR OLED ProMotion",
      },
      { category: "Tela", label: "Tamanho", value: "6,3 polegadas" },
      { category: "Desempenho", label: "Processador", value: "Apple A18 Pro" },
      {
        category: "Câmeras",
        label: "Sistema Pro",
        value: "48 MP Principal + Ultra-angular + Teleobjetiva 5x",
      },
      { category: "Construção", label: "Material", value: "Titânio aeroespacial" },
    ],
  },
};

export function getProductSpecs(slug: string): ProductSpecs | null {
  return productSpecs[slug] ?? null;
}

export function groupSpecs(specs: SpecItem[]): SpecGroup[] {
  const groups: SpecGroup[] = [];

  for (const spec of specs) {
    const existing = groups.find((group) => group.category === spec.category);

    if (existing) {
      existing.items.push(spec);
    } else {
      groups.push({ category: spec.category, items: [spec] });
    }
  }

  return groups;
}