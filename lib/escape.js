// HTML-escape any string that reaches innerHTML from outside the app.
// Address labels come from HERE's geocoding/autosuggest data, which includes
// business names — not something this app controls or can vouch for.
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
module.exports = { escapeHtml };
