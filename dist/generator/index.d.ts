interface Prisma8ContractRoot {
    model: string;
    namespace: string;
}
interface Prisma8ContractRelation {
    to: {
        model: string;
        namespace: string;
    };
}
interface Prisma8ContractModel {
    relations?: Record<string, Prisma8ContractRelation>;
}
interface Prisma8ContractJson {
    roots: Record<string, Prisma8ContractRoot>;
    domain: {
        namespaces: Record<string, {
            models: Record<string, Prisma8ContractModel>;
        }>;
    };
}
interface GenerateModelMapOptions {
    contractPath: string;
    outputPath: string;
    dbImport: string;
    runtimeImport?: string;
}

declare function renderModelMap(contract: Prisma8ContractJson, dbImport: string, runtimeImport?: string): string;
declare function generateModelMap(options: GenerateModelMapOptions): Promise<string>;

export { type GenerateModelMapOptions, type Prisma8ContractJson, type Prisma8ContractModel, type Prisma8ContractRelation, type Prisma8ContractRoot, generateModelMap, renderModelMap };
