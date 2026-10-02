import tseslint from "typescript-eslint";

export default [
  {
    ignores: [".next/**", "node_modules/**", "coverage/**", "public/**", ".vercel/**", "next-env.d.ts"],
  },
  ...tseslint.configs.recommended,
];
