// Pure logic for the HQ requisition / HQ supply / issue-to-ESD side of Meter Cost.
import { fyMonths, ESD_CODES, ESD_BY_CODE } from './meterCostCore.js';

export const LEDGERS = {
  req: { table: 'meter_cost_hq_req', dateCol: 'req_date', noCol: 'req_no', esd: false, link: false, title: 'Requisition submitted to HQ', noLabel: 'Requisition no' },
  supply: { table: 'meter_cost_hq_supply', dateCol: 'supply_date', noCol: 'ref_no', esd: false, link: true, title: 'Meters received from HQ', noLabel: 'Challan / reference no' },
  // The actual meters issued to each ESD (1-Ph / 3-Ph only, no New / Replacement tag).
  issue: { table: 'meter_cost_issue', dateCol: 'issue_date', noCol: 'issue_no', esd: true, link: false, title: 'Issue Register (meters issued to ESD)', noLabel: 'Issue no' },
};

const zero = () => ({ 1: 0, 3: 0 });

export function buildHqStatus({ deposits, reqs, supplies, prs, issues = null, fyStart }) {
  const months = new Set(fyMonths(fyStart));
  const inFy = (d) => months.has(String(d).slice(0, 7));

  // ---- circle level. Issued to ESDs = the Issue Register (falls back to the PRs only when no register is supplied).
  const dep = zero(), req = zero(), sup = zero(), iss = zero();
  for (const d of deposits) if (d.status === 'counted' && inFy(d.payment_date)) dep[d.phase] += 1;
  for (const r of reqs) if (inFy(r.req_date)) { req[1] += +r.ph1 || 0; req[3] += +r.ph3 || 0; }
  for (const s of supplies) if (inFy(s.supply_date)) { sup[1] += +s.ph1 || 0; sup[3] += +s.ph3 || 0; }
  if (issues) {
    for (const i of issues) if (inFy(i.issue_date)) { iss[1] += +i.ph1 || 0; iss[3] += +i.ph3 || 0; }
  } else {
    for (const p of prs) if (inFy(p.pr_date)) { iss[1] += +p.ph1 || 0; iss[3] += +p.ph3 || 0; }
  }
  const circle = {
    dep1: dep[1], dep3: dep[3],
    req1: req[1], req3: req[3],
    sup1: sup[1], sup3: sup[3],
    pend1: Math.max(req[1] - sup[1], 0), pend3: Math.max(req[3] - sup[3], 0),
    adv1: Math.max(sup[1] - req[1], 0), adv3: Math.max(sup[3] - req[3], 0),
    iss1: iss[1], iss3: iss[3],
    stock1: sup[1] - iss[1], stock3: sup[3] - iss[3],
  };

  // ---- per requisition. A receipt is linked by requisition number; one entered
  // before its requisition shows as advance and links itself once the requisition is added.
  const byReq = new Map();
  for (const r of reqs) {
    if (!inFy(r.req_date)) continue;
    const date = String(r.req_date).slice(0, 10);
    const e = byReq.get(r.req_no) || { req_no: r.req_no, date, r1: 0, r3: 0, h1: 0, h3: 0 };
    e.r1 += +r.ph1 || 0; e.r3 += +r.ph3 || 0;
    if (date < e.date) e.date = date;
    byReq.set(r.req_no, e);
  }
  let unlinked1 = 0, unlinked3 = 0;
  for (const s of supplies) {
    if (!inFy(s.supply_date)) continue;
    const e = s.req_no ? byReq.get(s.req_no) : null;
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
  return { circle, requisitions, unlinked: { h1: unlinked1, h3: unlinked3 } };
}

/**
 * PR vs Issue Register per ESD (1-Ph / 3-Ph totals; no New / Replacement tag).
 *  PR count < issues  -> the ESD was issued more than its PRs cover: PRs are still to be raised
 *                        (an advance issue), by the difference.
 *  PR count > issues  -> PRs raised but meters not issued yet: yet to be issued, by the difference.
 */
export function buildIssueStatus({ prs = [], issues = [], fyStart }) {
  const months = new Set(fyMonths(fyStart));
  const inFy = (d) => months.has(String(d).slice(0, 7));
  const rows = ESD_CODES.map((code) => {
    let pr1 = 0, pr3 = 0, iss1 = 0, iss3 = 0, issueCount = 0;
    for (const p of prs) if (p.esd_code === code && inFy(p.pr_date)) { pr1 += +p.ph1 || 0; pr3 += +p.ph3 || 0; }
    for (const i of issues) if (i.esd_code === code && inFy(i.issue_date)) { iss1 += +i.ph1 || 0; iss3 += +i.ph3 || 0; issueCount += 1; }
    return {
      esd_code: code, esd: ESD_BY_CODE[code], pr1, pr3, iss1, iss3, issueCount,
      toIssue1: Math.max(pr1 - iss1, 0), toIssue3: Math.max(pr3 - iss3, 0), // PR raised, meters yet to be issued
      toRaise1: Math.max(iss1 - pr1, 0), toRaise3: Math.max(iss3 - pr3, 0), // issued ahead of PR: PR to be raised
    };
  });
  const total = { esd: 'Circle total' };
  for (const f of ['pr1', 'pr3', 'iss1', 'iss3', 'issueCount', 'toIssue1', 'toIssue3', 'toRaise1', 'toRaise3']) {
    total[f] = rows.reduce((a, r) => a + r[f], 0);
  }
  return { rows, total };
}
