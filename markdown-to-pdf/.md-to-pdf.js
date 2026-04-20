module.exports = {
  stylesheet: ['./markdown-to-pdf/styles.css'],
  body_class: 'speckit-doc',
  pdf_options: {
    format: 'A4',
    margin: {
      top: '28mm',
      bottom: '24mm',
      left: '22mm',
      right: '22mm',
    },
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="width:100%; font-size:8px; color:#8b8fa3; font-family:'Segoe UI',system-ui,sans-serif; padding:0 22mm; display:flex; justify-content:space-between;">
        <span>SpecKit — Spec Driven Development</span>
        <span>v0.2.1</span>
      </div>`,
    footerTemplate: `
      <div style="width:100%; font-size:8px; color:#8b8fa3; font-family:'Segoe UI',system-ui,sans-serif; padding:0 22mm; display:flex; justify-content:space-between;">
        <span>Documentação Oficial</span>
        <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
      </div>`,
  },
  launch_options: {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
};
