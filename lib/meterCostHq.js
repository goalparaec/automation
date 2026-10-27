// Pure logic for the HQ requisition / HQ supply / issue-to-ESD side of Meter Cost.
import { ESD_BY_CODE, ESD_CODES, fyMonths } from './meterCostCore.js';

export const LEDGERS = {
  req: { table: 'meter_cost_hq_req', dateCol: 'req_date', noCol: 'req_no', esd: false, link: false, title: 'Requisition submitted to HQ', noLabel: 'Requisition no' },
  supply: { table: 'meter_cost_hq_supply', dateCol: 'supply_date', noCol: 'ref_no', esd: false, link: true, title: 'Meters received from HQ', noLabel: 'Challan / reference no' },
  issue: { table: 'meter_cost_issue', dateCol: 'issue_date', noCol: 'issue_no', esd: true, link: false, title: 'Meters issued to ESD', noLabel: 'Issue no' },
};

const KINDS = ['new', 'replacement'];
const k2 = (k) => (k === 'new' ? 'new' : 'rep');
const zero = () => ({ 1: 0, 3: 0 });

export function buildHqStatus({ deposits, reqs, supplies, issues, fyStart }) {
  const months = new Set(fyMonths(fyStart));
  const inFy = (d) => months.has(String(d).slice(0, 7));

  // ---- circle level: requisition vs received, and stock
  const circle = {};
  for (const kind of KINDS) {
    const dep = zero(), req = zero(), sup = zero(), iss = zero();
    for (const d of deposits) if (d.status === 'counted' && d.kind === kind && inFy(d.payment_date)) dep[d.phase] += 1;
    for (const r of reqs) if (r.kind === kind && inFy(r.req_date)) { req[1] += +r.ph1 || 0; req[3] += +r.ph3 || 0; }
    for (const s of supplies) if (s.kind === kind && inFy(s.supply_date)) { sup[1] += +s.ph1 || 0; sup[3] += +s.ph3 || 0; }
    for (const i of issues) if (i.kind === kind && inFy(i.issue_date)) { iss[1] += +i.ph1 || 0; iss[3] += +i.ph3 || 0; }
    circle[k2(kind)] = row(dep, req, sup, iss);
  }
  function row(dep, req, sup, iss) {
    return {
      dep1: dep[1], dep3: dep[3],
      req1: req[1], req3: req[3],
      sup1: sup[1], sup3: sup[3],
      pend1: Math.max(req[1] - sup[1], 0), pend3: Math.max(req[3] - sup[3], 0),
      adv1: Math.max(sup[1] - req[1], 0), adv3: Math.max(sup[3] - req[3], 0),
      iss1: iss[1], iss3: iss[3],
      stock1: sup[1] - iss[1], stock3: sup[3] - iss[3],
    };
  }
  const sumRows = (a, b) => Object.fromEntries(Object.keys(a).map((f) => [f, a[f] + b[f]]));
  circle.total = sumRows(circle.new, circle.rep);

  // ---- per requisition
  const byReq = new Map();
  for (const r of reqs) {
    if (!inFy(r.req_date)) continue;
    const key = `${r.req_no}|${r.kind}`;
    const e = byReq.get(key) || { req_no: r.req_no, kind: r.kind, date: String(r.req_date).slice(0, 10), r1: 0, r3: 0, h1: 0, h3: 0 };
    e.r1 += +r.ph1 || 0; e.r3 += +r.ph3 || 0;
    if (String(r.req_date).slice(0, 10) < e.date) e.date = String(r.req_date).slice(0, 10);
    byReq.set(key, e);
  }
  let unlinked1 = 0, unlinked3 = 0;
  for (const s of supplies) {
    if (!inFy(s.supply_date)) continue;
    const e = s.req_no ? byReq.get(`${s.req_no}|${s.kind}`) : null;
    if (e) { e.h1 += +s.ph1 || 0; e.h3 += +s.ph3 || 0; }
    else { unlinked1 += +s.ph1 || 0; unlinked3 += +s.ph3 || 0; }
  }
  const requisitions = [...byReq.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.req_no.localeCompare(b.req_no))
    .map((e) => ({
      ...e,
      pend1: Math.max(e.r1 - e.h1, 0), pend3: Math.max(e.r3 - e.h3, 0),
      adv1: Math.max(e.h1 - e.r1, 0), adv3: Math.max(e.h3 - e.r3, 0),
    }));

  // ---- per ESD: deposited vs issued
  const esdRows = ESD_CODES.map((code) => {
    const out = { esd_code: code, esd: ESD_BY_CODE[code] };
    for (const kind of KINDS) {
      const dep = zero(), iss = zero();
      for (const d of deposits) if (d.status === 'counted' && d.esd_code === code && d.kind === kind && inFy(d.payment_date)) dep[d.phase] += 1;
      for (const i of issues) if (i.esd_code === code && i.kind === kind && inFy(i.issue_date)) { iss[1] += +i.ph1 || 0; iss[3] += +i.ph3 || 0; }
      out[k2(kind)] = {
        dep1: dep[1], dep3: dep[3], iss1: iss[1], iss3: iss[3],
        pend1: Math.max(dep[1] - iss[1], 0), pend3: Math.max(dep[3] - iss[3], 0),
        adv1: Math.max(iss[1] - dep[1], 0), adv3: Math.max(iss[3] - dep[3], 0),
      };
    }
    return out;
  });
  const tot = (key) => {
    const t = { dep1: 0, dep3: 0, iss1: 0, iss3: 0, pend1: 0, pend3: 0, adv1: 0, adv3: 0 };
    for (const r of esdRows) for (const f of Object.keys(t)) t[f] += r[key][f];
    return t;
  };
  return {
    circle,
    requisitions,
    unlinked: { h1: unlinked1, h3: unlinked3 },
    esd: { rows: esdRows, total: { esd: 'Circle total', new: tot('new'), rep: tot('rep') } },
  };
}
