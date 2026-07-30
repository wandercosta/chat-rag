/**
 * Garante as fronteiras de modulo do ADR-002: um modulo so pode importar de
 * outro atraves do arquivo publico `index.ts`, nunca de arquivos internos
 * (repository.ts, service.ts, etc.) de outro modulo.
 */
module.exports = {
  forbidden: [
    {
      name: "no-deep-cross-module-imports",
      severity: "error",
      comment:
        "Importe apenas modules/<outro-modulo>/index.ts, nunca um arquivo interno de outro modulo.",
      from: { path: "^src/modules/([^/]+)/" },
      to: {
        path: "^src/modules/([^/]+)/(?!index\\.ts$).+",
        pathNot: "^src/modules/$1/",
      },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
  },
};
