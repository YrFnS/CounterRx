/* Inbound/outbound NCPDP SCRIPT (e-prescribing) message handling — skeleton.
 *
 * This is a CODE SEAM, not a live integration. Real e-prescribing requires a
 * Surescripts (or equivalent hub) trading-partner account + EPCS certification
 * (PKI two-factor tokens, audited identity proofing). None of that can be
 * provisioned from inside the repo — see docs/eprescribe-readiness.md.
 *
 * What this module does today:
 *   - parseNewRx(xml) … normalize a minimal inbound SCRIPT <NewRx> into RxMessage
 *   - mapRxMessageToPrescription(msg, ctx) … storage-mapping to the existing
 *     Prescription shape in src/data.ts (the same shape NEW_PRESCRIPTION builds)
 *   - buildNewRxMessage(rx, ctx) … symmetric outbound <NewRx> builder
 *
 * A tiny dependency-free XML reader is used so the parser works in the Node test
 * environment (no DOMParser). It is tolerant by construction and throws
 * RxParseError on structurally invalid input.
 */

import type { Prescription, Product, Prescriber } from "../data";

export class RxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RxParseError";
  }
}

/** Normalized inbound NewRx — only the fields we can safely store today. */
export interface RxMessage {
  messageType: "newRx" | "refillRequest" | "cancelRx" | "unknown";
  rxReferenceNumber?: string;
  patient: {
    lastName: string;
    firstName: string;
    dob?: string; // ISO date
    gender?: "M" | "F" | "O";
    address?: string;
    phone?: string;
  };
  medication: {
    drugDescription: string;
    ndc?: string; // 5-4-2
    quantity: number;
    directions?: string; // sig
    daysSupply?: number;
  };
  prescriber: {
    npi: string;
    dea?: string;
    lastName: string;
    firstName: string;
    credentials?: string;
  };
  pharmacy?: { ncpdpId?: string; name?: string };
}

/* ----------------------- minimal XML reader ----------------------- */

interface XmlNode {
  name: string;
  children: XmlNode[];
  text: string;
}

function parseAttrs(_s: string): Record<string, string> {
  // Attributes are not needed for SCRIPT field extraction; kept for clarity.
  return {};
}

function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: "#root", children: [], text: "" };
  const stack: XmlNode[] = [root];
  const re = /<(\/?)([A-Za-z0-9_:.-]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[5] !== undefined) {
      const t = m[5].trim();
      if (t) stack[stack.length - 1].text += (stack[stack.length - 1].text ? " " : "") + t;
      continue;
    }
    const closing = m[1] === "/";
    const name = m[2];
    const selfClose = m[4] === "/";
    if (closing) {
      if (stack.length > 1 && stack[stack.length - 1].name === name) stack.pop();
      continue;
    }
    void parseAttrs(m[3] ?? "");
    const node: XmlNode = { name, children: [], text: "" };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root;
}

const child = (n: XmlNode | undefined, name: string): XmlNode | undefined =>
  n?.children.find((c) => c.name.toLowerCase() === name.toLowerCase());
const findDesc = (n: XmlNode | undefined, name: string): XmlNode | undefined => {
  if (!n) return undefined;
  for (const c of n.children) {
    if (c.name.toLowerCase() === name.toLowerCase()) return c;
    const deeper = findDesc(c, name);
    if (deeper) return deeper;
  }
  return undefined;
};
const textOf = (n: XmlNode | undefined): string | undefined => {
  if (!n?.text.trim()) return undefined;
  const t = n!.text.trim();
  return t
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
};

/* ----------------------- inbound parser ----------------------- */

export function parseNewRx(xml: string): RxMessage {
  const root = parseXml(xml);
  const newRx = findDesc(root, "NewRx");
  if (!newRx) throw new RxParseError("No <NewRx> element found in SCRIPT message");

  const patientNode = child(newRx, "Patient");
  if (!patientNode) throw new RxParseError("<NewRx> missing <Patient>");

  const medNode = child(newRx, "MedicationPrescribed");
  if (!medNode) throw new RxParseError("<NewRx> missing <MedicationPrescribed>");

  const prescriberNode = child(newRx, "Prescriber");
  if (!prescriberNode) throw new RxParseError("<NewRx> missing <Prescriber>");

  const qtyText = textOf(child(child(medNode, "Quantity"), "Value"));
  if (qtyText === undefined) throw new RxParseError("<Quantity>/<Value> missing");
  const quantity = Number(qtyText);
  if (!Number.isFinite(quantity) || quantity <= 0)
    throw new RxParseError(`Invalid <Quantity> "${qtyText}"`);

  const dsText = textOf(child(medNode, "DaysSupply"));
  const daysSupply = dsText !== undefined ? Number(dsText) : undefined;

  const drugCoded = child(medNode, "DrugCoded");
  const ndc = textOf(child(drugCoded, "ProductCode"));

  const presId = child(prescriberNode, "Identification");
  const npi = textOf(child(presId, "NPI"));
  if (!npi) throw new RxParseError("<Prescriber> missing <NPI>");
  const dea = textOf(child(presId, "DEANumber"));

  const presName = child(prescriberNode, "Name");

  const pharmNode = child(newRx, "Pharmacy");
  let pharmacy: RxMessage["pharmacy"];
  if (pharmNode) {
    const pharmId = child(pharmNode, "Identification");
    const ncpdpId = textOf(child(pharmId, "NCPDPID"));
    const name = textOf(child(pharmId, "Name"));
    if (ncpdpId || name) pharmacy = { ncpdpId, name };
  }

  return {
    messageType: "newRx",
    patient: {
      lastName: textOf(child(patientNode, "LastName")) ?? "",
      firstName: textOf(child(patientNode, "FirstName")) ?? "",
      dob: textOf(child(patientNode, "DateOfBirth")),
      gender: (textOf(child(patientNode, "Gender")) as RxMessage["patient"]["gender"]) || undefined,
      address: textOf(child(patientNode, "Address")),
      phone: textOf(child(patientNode, "Phone")),
    },
    medication: {
      drugDescription: textOf(child(medNode, "DrugDescription")) ?? "",
      ndc,
      quantity,
      directions: textOf(child(medNode, "Directions")),
      daysSupply: daysSupply !== undefined && Number.isFinite(daysSupply) ? daysSupply : undefined,
    },
    prescriber: {
      npi,
      dea,
      lastName: textOf(child(presName, "LastName")) ?? "",
      firstName: textOf(child(presName, "FirstName")) ?? "",
      credentials: textOf(child(prescriberNode, "Credentials")),
    },
    pharmacy,
  };
}

/* ----------------------- storage mapping ----------------------- */

export interface RxMappingContext {
  /** Resolve a catalog productId from an NDC or free-text drug description. */
  resolveProductId: (med: RxMessage["medication"]) => string | undefined;
  /** Resolve a prescriber directory id from the prescriber's NPI. */
  resolvePrescriberId: (p: RxMessage["prescriber"]) => string | undefined;
  /** Mint the next Rx id (mirrors the store's RX-#### scheme). */
  nextRxId: () => string;
}

function ageFromDob(dob?: string): number {
  if (!dob) return 0;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

/** Map a parsed inbound message onto the existing Prescription shape.
 *  Throws RxParseError when the referenced prescriber/product can't be resolved
 *  in the local directories — the live certified path would reject at the hub. */
export function mapRxMessageToPrescription(
  msg: RxMessage,
  ctx: RxMappingContext,
): Prescription {
  const productId = ctx.resolveProductId(msg.medication);
  if (!productId)
    throw new RxParseError(
      `No catalog product matches ${msg.medication.ndc ?? msg.medication.drugDescription}`,
    );
  const prescriberId = ctx.resolvePrescriberId(msg.prescriber);
  if (!prescriberId)
    throw new RxParseError(`No prescriber directory entry for NPI ${msg.prescriber.npi}`);

  const patientName = [msg.patient.firstName, msg.patient.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    id: ctx.nextRxId(),
    patient: patientName,
    age: ageFromDob(msg.patient.dob),
    productId,
    qty: msg.medication.quantity,
    prescriberId,
    status: "new",
    createdAt: Date.now(),
    daysSupply: msg.medication.daysSupply,
    note: msg.medication.directions,
    phone: msg.patient.phone,
  };
}

/* ----------------------- outbound builder ----------------------- */

export interface RxBuildContext {
  patient: RxMessage["patient"];
  product: Pick<Product, "name" | "ndc">;
  prescriber: Pick<Prescriber, "npi" | "dea" | "name" | "credentials">;
  sender?: { ncpdpId?: string; name?: string };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: "", last: parts[0] };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

/** Build a minimal SCRIPT <NewRx> XML string from a Prescription.
 *  The Prescription only carries ids + qty; the referenced patient/product/
 *  prescriber records are supplied via ctx (the live certified integration
 *  resolves them from state — here it is a code seam). */
export function buildNewRxMessage(rx: Prescription, ctx: RxBuildContext): string {
  const p = ctx.patient;
  const pres = splitName(ctx.prescriber.name);
  const now = new Date().toISOString();
  const ncpdp = ctx.sender?.ncpdpId ?? "";
  const senderName = ctx.sender?.name ?? "";
  const gender = p.gender ?? "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<Message xmlns="http://www.ncpdp.org/schema/SCRIPT/20170701">
  <Header>
    <To><ID>PENDING</ID></To>
    <From><ID>${esc(ncpdp)}</ID></From>
    <MessageID>${esc(rx.id)}</MessageID>
    <SentTime>${esc(now)}</SentTime>
    <SenderSoftware>CounterRx</SenderSoftware>
  </Header>
  <Body>
    <NewRx>
      <Pharmacy>
        <Identification>
          <NCPDPID>${esc(ncpdp)}</NCPDPID>
          <Name>${esc(senderName)}</Name>
        </Identification>
      </Pharmacy>
      <Patient>
        <LastName>${esc(p.lastName)}</LastName>
        <FirstName>${esc(p.firstName)}</FirstName>
        <Gender>${esc(gender)}</Gender>
        <DateOfBirth>${esc(p.dob ?? "")}</DateOfBirth>
        <Address>${esc(p.address ?? "")}</Address>
        <Phone>${esc(p.phone ?? "")}</Phone>
      </Patient>
      <MedicationPrescribed>
        <DrugDescription>${esc(ctx.product.name)}</DrugDescription>
        <DrugCoded>
          <ProductCode>${esc(ctx.product.ndc ?? "")}</ProductCode>
          <ProductCodeType>NDC</ProductCodeType>
        </DrugCoded>
        <Quantity><Value>${rx.qty}</Value><Code>EA</Code></Quantity>
        <Directions>${esc(rx.note ?? "")}</Directions>
        <DaysSupply>${rx.daysSupply ?? ""}</DaysSupply>
      </MedicationPrescribed>
      <Prescriber>
        <Identification>
          <NPI>${esc(ctx.prescriber.npi)}</NPI>
          <DEANumber>${esc(ctx.prescriber.dea ?? "")}</DEANumber>
        </Identification>
        <Name>
          <LastName>${esc(pres.last)}</LastName>
          <FirstName>${esc(pres.first)}</FirstName>
        </Name>
        <Credentials>${esc(ctx.prescriber.credentials ?? "")}</Credentials>
      </Prescriber>
    </NewRx>
  </Body>
</Message>`;
}
