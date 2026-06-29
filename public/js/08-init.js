/* Application startup. */
function renderAll(){ renderSession(); renderMapEvents(); renderHost(); renderTickets(); renderSocial(); renderTopStats(); updateMobileShell((location.hash || '#map').slice(1) || 'map'); }

boot().catch(err=>{ console.error(err); toast(err.message || 'App failed to load.', 'error'); });
