export const runAcceptKey = (driverId: string, runId: string) => `delivery-run-accept:${driverId}:${runId}`;
const referenceText = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160 && value === value.trim() && !/[\x00-\x1f\x7f]/.test(value);

export function orderReferences(order: any) {
    const read = (key: string) => typeof order.getAttribute === 'function' ? order.getAttribute(key) : key.split('.').reduce((value, part) => value?.[part], order);
    const meta = read('meta');
    const number = meta?.cargodept_order_number;
    const doNumber = typeof number === 'string' && /^DO-[1-9][0-9]*$/.test(number) ? number : null;
    const lists = meta?.cargodept_packing_lists;
    const fallback = read('tracking_number.tracking_number') || read('tracking') || doNumber || order.id;
    if (meta?.cargodept_source !== 'cargodept-v1' || !Array.isArray(lists) || !lists.length || lists.length > 1000 ||
        lists.some(list => !referenceText(list?.number) || !referenceText(list?.customer_code))) {
        return { customers: '', packingLists: '', primary: fallback, secondary: doNumber && doNumber !== fallback ? doNumber : null };
    }
    const customers = [...new Set(lists.map(list => list.customer_code))].join(', ');
    const packingLists = 'PL ' + [...new Set(lists.map(list => list.number))].join(', ');
    return { customers, packingLists, primary: customers + ' · ' + packingLists, secondary: doNumber };
}

export const runDistance = (run: any) => Number.isFinite(Number(run.distance_m)) && run.distance_m !== null
    ? `~${(Number(run.distance_m) / 1000).toFixed(1)} km` : 'Distance unavailable';
export const currentRunOrder = (run: any) => run.orders.find((order: any) => !['completed', 'canceled'].includes(order.status));

// No auth tokens, GPS access, native bridge or untrusted HTML in this map.
// The connecting line shows the dispatcher sequence, not road navigation.
export function runMapHtml(stops: any[]) {
    const points = stops.map(s => [s.lat, s.lng]).filter(p => p.every(n => typeof n === 'number' && Number.isFinite(n)) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180);
    const data = JSON.stringify(points).replace(/</g, '\\u003c');
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://unpkg.com; style-src 'unsafe-inline' https://unpkg.com; img-src https://tile.openstreetmap.org data:; connect-src 'none'"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""><style>html,body,#map{height:100%;margin:0;background:#1f2937}#fallback{position:absolute;z-index:1;color:#fff;padding:12px;font:14px sans-serif}.pin{background:#2563eb;color:white;border:2px solid white;border-radius:50%;text-align:center;line-height:25px;font:bold 13px sans-serif}</style></head><body><div id="fallback">Loading route map… Use the stop list below if the map is unavailable.</div><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script><script>if(window.L){const p=${data};if(p.length){const m=L.map('map');L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(m);L.polyline(p,{color:'#2563eb',dashArray:'6 6'}).addTo(m);const groups=new Map();p.forEach((v,i)=>{const key=v.join(',');if(!groups.has(key))groups.set(key,{point:v,n:[]});groups.get(key).n.push(i+1)});groups.forEach(g=>{const width=Math.max(26,g.n.length*16);L.marker(g.point,{icon:L.divIcon({className:'pin',html:g.n.join('·'),iconSize:[width,26],iconAnchor:[width/2,13]})}).addTo(m)});m.fitBounds(p,{padding:[25,25],maxZoom:14});document.getElementById('fallback').remove();}}</script></body></html>`;
}
