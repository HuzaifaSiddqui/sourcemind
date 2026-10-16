/* Demo legal documents. Fictional companies: Helix Systems Ltd (us), Meridian Retail Group plc (customer),
   Kestrel Cloud Services Ltd (supplier), Northstar Logistics (reseller customer). */

export type Block = ['h' | 'p', string];
export type Page = Block[];

export const enterpriseMsa: Page[] = [
  [
    ['h', 'Enterprise Master Subscription Agreement 2026'],
    ['p', 'This Enterprise Master Subscription Agreement (the "Agreement") is entered into between Helix Systems Ltd, a company registered in England and Wales ("Supplier"), and Meridian Retail Group plc ("Customer"). This Agreement is effective from 15 September 2026 (the "Effective Date") and governs Customer\'s access to the Helix analytics platform and related professional services.'],
    ['h', '1. Definitions'],
    ['p', '"Committed Fees" means the subscription fees for the full Initial Term as set out in the Pricing Schedule. "Initial Term" means the period described in Section 6.1. "Customer Data" means all data submitted to the Services by or on behalf of Customer. "Services" means the subscription services and support described in an Order Form.'],
    ['p', '"Service Credit" means the credit calculated under Section 7.3. "Security Addendum" means the information security terms attached to this Agreement, which form part of it.'],
  ],
  [
    ['h', '2. Subscription and Access Rights'],
    ['p', 'Subject to payment of the fees, Supplier grants Customer a non-exclusive, non-transferable right during the Subscription Term to access and use the Services for its internal business purposes. Access is limited to the number of named users specified in the Order Form.'],
    ['p', 'Customer may add named users at any time at the rates in the Pricing Schedule. Additional users are co-terminous with the current Subscription Term and are invoiced pro rata.'],
    ['h', '3. Customer Responsibilities'],
    ['p', 'Customer is responsible for the accuracy and legality of Customer Data, for maintaining the confidentiality of user credentials, and for ensuring that its users comply with this Agreement. Customer shall notify Supplier promptly of any unauthorised use of an account.'],
    ['p', 'Customer shall not resell the Services, attempt to reverse engineer the platform, or use the Services to build a competing product.'],
  ],
  [
    ['h', '4. Fees'],
    ['p', 'Customer shall pay the fees set out in the Pricing Schedule. Committed Fees are fixed for the Initial Term. Fees are exclusive of VAT, which shall be added at the applicable rate.'],
    ['p', 'At each renewal Supplier may adjust the fees on not less than 60 days\' notice, provided that any increase shall not exceed 5% of the fees for the preceding year.'],
    ['h', '5. Invoicing and Payment Terms'],
    ['p', 'Supplier will invoice the annual subscription fee in advance on the Effective Date and on each anniversary of it. Invoices are payable within thirty (30) days of the invoice date (Net 30).'],
    ['p', 'Overdue amounts accrue interest at 1.5% per month from the due date until payment is received. Supplier may suspend access to the Services if any undisputed amount remains unpaid for more than 30 days after Supplier has given written notice of the overdue amount.'],
    ['p', 'Customer may dispute an invoice in good faith by notifying Supplier before the due date, in which case the parties shall resolve the dispute within 20 business days.'],
  ],
  [
    ['h', '6. Term and Renewal'],
    ['p', '6.1 The Initial Term is twenty-four (24) months from the Effective Date. 6.2 After the Initial Term, this Agreement will automatically renew for successive twelve (12) month renewal terms unless either party gives written notice of non-renewal at least sixty (60) days before the end of the then-current term.'],
    ['h', '7. Service Levels'],
    ['p', '7.1 Supplier will make the Services available 99.9% of the time in each calendar month, excluding scheduled maintenance announced at least 48 hours in advance.'],
    ['p', '7.2 Support requests classified as Priority 1 will receive a response within one hour, 24 hours a day, seven days a week.'],
    ['p', '7.3 If monthly availability falls below the commitment, Customer is entitled to a Service Credit of 5% of the monthly fee for each 0.5% shortfall, capped at 30% of the monthly fee. Service Credits are Customer\'s sole remedy for availability failures.'],
  ],
  [
    ['h', '8. Termination'],
    ['p', '8.1 Termination for cause. Either party may terminate this Agreement immediately by written notice if the other party commits a material breach and fails to remedy it within thirty (30) days of receiving notice describing the breach.'],
    ['p', '8.2 Insolvency. Either party may terminate this Agreement if the other party becomes insolvent, enters administration or ceases to carry on business.'],
    ['h', '8.4 Termination for Convenience'],
    ['p', 'Customer may terminate this Agreement for convenience before the end of the Initial Term by giving Supplier ninety (90) days\' prior written notice. Customer termination for convenience does not relieve Customer of payment obligations: Customer remains responsible for all Committed Fees for the remainder of the Initial Term, which become due on the effective date of termination.'],
    ['p', 'No refund of prepaid fees will be made on termination for convenience. Fees are refundable only where Customer terminates under Section 8.1 for Supplier\'s uncured material breach, in which case Supplier will refund prepaid fees covering the period after termination.'],
    ['h', '8.5 Effect of Termination'],
    ['p', 'On termination Customer\'s access to the Services ends. Supplier will make Customer Data available for export for thirty (30) days, after which it will be deleted in accordance with the Security Addendum.'],
  ],
  [
    ['h', '9. Data Protection'],
    ['p', 'Supplier processes Customer Data as a processor on behalf of Customer, who is the controller. Supplier shall process Customer Data only on documented instructions and in accordance with the Data Processing Addendum and applicable data protection law, including the UK GDPR.'],
    ['p', 'Supplier shall notify Customer of a personal data breach without undue delay and in any event within seventy-two (72) hours of becoming aware of it, as further described in the Security Addendum.'],
    ['h', '10. Confidentiality'],
    ['p', 'Each party shall keep the other party\'s Confidential Information confidential and use it only to perform this Agreement. These obligations survive for five (5) years after termination, and indefinitely for trade secrets.'],
  ],
  [
    ['h', '11. Limitation of Liability'],
    ['p', 'Neither party excludes liability for death or personal injury caused by negligence, for fraud, or for any liability that cannot be limited by law.'],
    ['p', 'Subject to the above, each party\'s total aggregate liability arising out of this Agreement shall be limited to the total fees paid or payable by Customer in the twelve (12) months preceding the event giving rise to the claim. Neither party is liable for loss of profits, revenue or goodwill, or for indirect or consequential loss.'],
    ['h', '12. Governing Law'],
    ['p', 'This Agreement is governed by the laws of England and Wales, and the courts of England have exclusive jurisdiction over any dispute arising from it.'],
    ['h', '13. General'],
    ['p', 'This Agreement, together with the Order Form, Pricing Schedule and Security Addendum, constitutes the entire agreement between the parties. Notices must be given in writing to the addresses in the Order Form.'],
  ],
];

export const pricingSchedule: Page[] = [
  [
    ['h', 'Pricing Schedule — Meridian Retail Group'],
    ['p', 'This Pricing Schedule forms part of the Enterprise Master Subscription Agreement 2026 between Helix Systems Ltd and Meridian Retail Group plc.'],
    ['h', 'Order Summary'],
    ['p', 'The total contract value is £240,000 for the 24-month Initial Term, comprising an annual subscription fee of £120,000 for up to 400 named users of the Helix Enterprise plan.'],
    ['p', 'The annual subscription fee is a Committed Fee. Additional named users are charged at £290 per user per year, pro-rated to the end of the current term.'],
    ['h', 'Payment Schedule'],
    ['p', 'Year 1 fee of £120,000 is invoiced on 15 September 2026. Year 2 fee of £120,000 is invoiced on 15 September 2027. Each invoice is payable within 30 days.'],
  ],
  [
    ['h', 'Early Termination Charges'],
    ['p', 'If Customer terminates before the end of the Initial Term for any reason other than Supplier\'s uncured material breach, all remaining Committed Fees for the Initial Term become payable in full within 30 days of the termination date. For example, termination at the end of month 15 makes the unpaid balance of the Year 2 fee immediately due.'],
    ['h', 'Professional Services'],
    ['p', 'Implementation services are charged at a fixed fee of £18,000. Additional consulting is charged at £1,150 per day. Training workshops are £2,400 per session for up to 20 attendees.'],
    ['h', 'Renewal Pricing'],
    ['p', 'Renewal fees may increase by no more than 5% per year, as described in Section 4 of the Agreement.'],
  ],
];

export const securityAddendum: Page[] = [
  [
    ['h', 'Security Addendum'],
    ['p', 'This Security Addendum describes the technical and organisational measures Helix Systems Ltd maintains to protect Customer Data under the Enterprise Master Subscription Agreement 2026.'],
    ['h', '1. Encryption'],
    ['p', 'Customer Data is encrypted at rest using AES-256 and in transit using TLS 1.2 or higher. Encryption keys are managed in a hardware-backed key management service and rotated every 90 days.'],
    ['h', '2. Access Control'],
    ['p', 'Production access is restricted to named engineers using single sign-on with hardware security keys. All administrative access is logged and reviewed monthly.'],
    ['h', '3. Certifications and Testing'],
    ['p', 'Supplier maintains a SOC 2 Type II report and ISO 27001 certification. An independent penetration test is performed at least annually and a summary is available to Customer on request.'],
  ],
  [
    ['h', '4. Security Incident and Breach Notification'],
    ['p', 'Supplier will notify Customer of any confirmed security incident affecting Customer Data within seventy-two (72) hours of becoming aware of it. The notice will describe the nature of the incident, the categories of data affected, likely consequences and the measures taken or proposed.'],
    ['p', 'Following a data breach, Supplier will provide an incident report within ten (10) business days, cooperate with any regulator enquiry, and bear the reasonable costs of notifying affected individuals where the breach resulted from Supplier\'s failure to comply with this Addendum.'],
    ['h', '5. Data Retention and Deletion'],
    ['p', 'Customer Data is retained for the duration of the Agreement. After termination, Customer Data is deleted from production systems within 30 days and from encrypted backups within 90 days, and Supplier will certify deletion on request.'],
    ['h', '6. Sub-processors'],
    ['p', 'Supplier maintains a list of approved sub-processors and will give Customer 30 days\' notice before adding a new sub-processor, during which Customer may object on reasonable data protection grounds.'],
  ],
];

const supplier = (v: {
  year: string; effective: string; term: string; renewal: string; payment: string; late: string; discount: string;
  uptime: string; notice: string; cap: string; retention: string; increase: string;
}): Page[] => [
  [
    ['h', `Supplier Agreement ${v.year} — Kestrel Cloud Services`],
    ['p', `This Supplier Agreement is made between Helix Systems Ltd ("Customer") and Kestrel Cloud Services Ltd ("Supplier") for the provision of managed cloud hosting and data platform services. It is effective from ${v.effective}.`],
    ['h', '1. Scope of Services'],
    ['p', 'Supplier will provide managed hosting, database administration, backup and 24/7 monitoring for Customer\'s production environments in the UK South and EU West regions, as described in the Service Description.'],
    ['h', '2. Term and Renewal'],
    ['p', `The initial term is ${v.term} from the effective date. ${v.renewal}`],
  ],
  [
    ['h', '3. Fees and Price Adjustments'],
    ['p', `Fees are set out in the Order Form and are payable in GBP. ${v.increase}`],
    ['h', '4. Invoicing and Payment'],
    ['p', `Supplier will invoice monthly in arrears. ${v.payment} ${v.late}`],
    ['p', v.discount],
    ['h', '5. Service Levels'],
    ['p', `Supplier will maintain ${v.uptime} monthly availability for production services. Failure to meet this target entitles Customer to service credits as described in the Service Description.`],
  ],
  [
    ['h', '6. Termination'],
    ['p', `Either party may terminate this Agreement for convenience on ${v.notice} prior written notice to the other party. Either party may terminate immediately for material breach that is not remedied within 30 days of notice.`],
    ['h', '7. Limitation of Liability'],
    ['p', `Each party's total aggregate liability under this Agreement is limited to the fees paid in the ${v.cap} months preceding the claim, except for liability that cannot be limited by law.`],
    ['h', '8. Records and Data Retention'],
    ['p', `Supplier shall retain operational logs and billing records for ${v.retention} and shall delete Customer production data within 60 days of termination.`],
    ['h', '9. Governing Law'],
    ['p', 'This Agreement is governed by the laws of England and Wales.'],
  ],
];

export const supplier2025 = supplier({
  year: '2025', effective: '1 April 2025', term: 'twelve (12) months',
  renewal: 'The Agreement renews automatically for successive 12-month terms unless terminated in accordance with Section 6.',
  payment: 'Invoices are payable within forty-five (45) days of receipt (Net 45).',
  late: 'Late payments accrue interest at 1% per month on the overdue amount.',
  discount: 'Customer is not entitled to any discount for early payment.',
  uptime: '99.5%', notice: 'ninety (90) days\'', cap: '12', retention: 'a period of seven (7) years',
  increase: 'Supplier may increase fees once per year by no more than CPI plus 2%.',
});

export const supplier2026 = supplier({
  year: '2026', effective: '1 April 2026', term: 'twenty-four (24) months',
  renewal: 'The Agreement renews automatically for successive 24-month terms unless terminated in accordance with Section 6.',
  payment: 'Invoices are payable within thirty (30) days of receipt (Net 30).',
  late: 'Late payments accrue interest at 1.5% per month on the overdue amount.',
  discount: 'Customer may deduct an early payment discount of 2% from any invoice paid within ten (10) days of receipt.',
  uptime: '99.9%', notice: 'sixty (60) days\'', cap: '18', retention: 'a period of five (5) years',
  increase: 'Supplier may increase fees once per year, provided the increase does not exceed 5% of the prior year\'s fees.',
});

export const northstar: Page[] = [
  [
    ['h', 'Northstar Logistics — Platform Agreement'],
    ['p', 'This Platform Agreement is between Helix Systems Ltd and Northstar Logistics Ltd for the Helix Growth plan, effective from 1 February 2026 for an initial term of 12 months.'],
    ['h', '9. Fees and Payment'],
    ['p', 'The annual fee of £36,000 is invoiced quarterly in advance and payable within 30 days.'],
    ['h', '10. Renewal'],
    ['p', 'The agreement renews automatically for further 12-month terms unless cancelled in accordance with Section 11.'],
    ['h', '11. Cancellation'],
    ['p', 'Northstar may cancel the agreement at the end of the current term by giving at least thirty (30) days\' written notice. Northstar may also cancel early, before the end of the current term, by paying an early cancellation charge equal to 50% of the fees remaining for that term.'],
    ['p', 'Helix may cancel the agreement on 90 days\' notice if it discontinues the Growth plan, in which case prepaid fees for the unused period will be refunded.'],
  ],
];
