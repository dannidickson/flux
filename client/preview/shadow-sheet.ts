export function createSheet(css: string): CSSStyleSheet {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    return sheet;
}
