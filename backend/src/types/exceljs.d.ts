declare module 'exceljs' {
  // Minimal typing shim so the backend can compile even if exceljs isn't installed yet.
  // When exceljs is installed, TypeScript will pick up its real types instead.
  const ExcelJS: any;
  export = ExcelJS;
}

