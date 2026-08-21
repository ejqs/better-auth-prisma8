export interface Prisma8ContractRoot {
  model: string;
  namespace: string;
}

export interface Prisma8ContractRelation {
  to: {
    model: string;
    namespace: string;
  };
}

export interface Prisma8ContractModel {
  relations?: Record<string, Prisma8ContractRelation>;
}

export interface Prisma8ContractJson {
  roots: Record<string, Prisma8ContractRoot>;
  domain: {
    namespaces: Record<
      string,
      { models: Record<string, Prisma8ContractModel> }
    >;
  };
}

export interface GenerateModelMapOptions {
  contractPath: string;
  outputPath: string;
  dbImport: string;
  runtimeImport?: string;
}
