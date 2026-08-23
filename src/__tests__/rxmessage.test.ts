import { describe, it, expect } from "vitest";
import {
  parseNewRx,
  mapRxMessageToPrescription,
  buildNewRxMessage,
  RxParseError,
  type RxMessage,
  type RxMappingContext,
  type RxBuildContext,
} from "../lib/rxmessage";
import type { Prescription } from "../data";

const SAMPLE_NEW_RX = `<?xml version="1.0" encoding="UTF-8"?>
<Message xmlns="http://www.ncpdp.org/schema/SCRIPT/20170701">
  <Body>
    <NewRx>
      <Patient>
        <LastName>Diallo</LastName>
        <FirstName>Amara</FirstName>
        <Gender>F</Gender>
        <DateOfBirth>1983-04-12</DateOfBirth>
        <Address>12 Oyster St</Address>
        <Phone>555-321-9044</Phone>
      </Patient>
      <MedicationPrescribed>
        <DrugDescription>Losartan 50mg</DrugDescription>
        <DrugCoded>
          <ProductCode>68258-8945-01</ProductCode>
          <ProductCodeType>NDC</ProductCodeType>
        </DrugCoded>
        <Quantity><Value>2</Value><Code>EA</Code></Quantity>
        <Directions>Take 1 tablet daily</Directions>
        <DaysSupply>30</DaysSupply>
      </MedicationPrescribed>
      <Prescriber>
        <Identification>
          <NPI>1234567890</NPI>
          <DEANumber>X1234567</DEANumber>
        </Identification>
        <Name><LastName>Vance</LastName><FirstName>R.</FirstName></Name>
        <Credentials>MD</Credentials>
      </Prescriber>
      <Pharmacy>
        <Identification>
          <NCPDPID>9876543</NCPDPID>
          <Name>Main Street Pharmacy</Name>
        </Identification>
      </Pharmacy>
    </NewRx>
  </Body>
</Message>`;

const BASE_RX: Prescription = {
  id: "RX-0001",
  patient: "Amara Diallo",
  age: 40,
  productId: "los50",
  qty: 2,
  prescriberId: "DR-01",
  status: "new",
  createdAt: 1700000000000,
  daysSupply: 30,
  note: "Take 1 tablet daily",
};

describe("parseNewRx", () => {
  it("parses a minimal newRx SCRIPT message (happy path)", () => {
    const msg = parseNewRx(SAMPLE_NEW_RX);
    expect(msg.messageType).toBe("newRx");
    expect(msg.patient.lastName).toBe("Diallo");
    expect(msg.patient.firstName).toBe("Amara");
    expect(msg.patient.gender).toBe("F");
    expect(msg.patient.dob).toBe("1983-04-12");
    expect(msg.patient.address).toBe("12 Oyster St");
    expect(msg.patient.phone).toBe("555-321-9044");
    expect(msg.medication.drugDescription).toBe("Losartan 50mg");
    expect(msg.medication.ndc).toBe("68258-8945-01");
    expect(msg.medication.quantity).toBe(2);
    expect(msg.medication.directions).toBe("Take 1 tablet daily");
    expect(msg.medication.daysSupply).toBe(30);
    expect(msg.prescriber.npi).toBe("1234567890");
    expect(msg.prescriber.dea).toBe("X1234567");
    expect(msg.prescriber.lastName).toBe("Vance");
    expect(msg.prescriber.firstName).toBe("R.");
    expect(msg.prescriber.credentials).toBe("MD");
    expect(msg.pharmacy).toEqual({ ncpdpId: "9876543", name: "Main Street Pharmacy" });
  });

  it("throws RxParseError when <NewRx> is absent", () => {
    expect(() => parseNewRx(`<?xml version="1.0"?><Message><Body></Body></Message>`))
      .toThrow(RxParseError);
  });

  it("throws RxParseError when <Patient> is missing", () => {
    const bad = SAMPLE_NEW_RX.replace(/<Patient>[\s\S]*?<\/Patient>/, "");
    expect(() => parseNewRx(bad)).toThrow(/missing <Patient>/);
  });

  it("throws RxParseError when <Prescriber>/<NPI> is missing", () => {
    const bad = SAMPLE_NEW_RX.replace(/<Prescriber>[\s\S]*?<\/Prescriber>/, "<Prescriber><Name/></Prescriber>");
    expect(() => parseNewRx(bad)).toThrow(/missing <NPI>/);
  });

  it("throws RxParseError on non-numeric or non-positive <Quantity>", () => {
    const bad = SAMPLE_NEW_RX.replace(/<Value>2<\/Value>/, "<Value>abc</Value>");
    expect(() => parseNewRx(bad)).toThrow(RxParseError);
    const zero = SAMPLE_NEW_RX.replace(/<Value>2<\/Value>/, "<Value>0</Value>");
    expect(() => parseNewRx(zero)).toThrow(RxParseError);
  });

  it("defaults daysSupply/NPI/dea to undefined when absent", () => {
    const noDs = SAMPLE_NEW_RX
      .replace(/<DaysSupply>30<\/DaysSupply>/, "")
      .replace(/<DEANumber>X1234567<\/DEANumber>/, "");
    const msg = parseNewRx(noDs);
    expect(msg.medication.daysSupply).toBeUndefined();
    expect(msg.prescriber.dea).toBeUndefined();
  });
});

const makeCtx = (): RxMappingContext => {
  const prescribers: Record<string, string> = { "1234567890": "DR-01" };
  const products: Record<string, string> = { "68258-8945-01": "los50", "Losartan 50mg": "los50" };
  let seq = 0;
  return {
    resolveProductId: (med) => (med.ndc ? products[med.ndc] : products[med.drugDescription]),
    resolvePrescriberId: (p) => prescribers[p.npi],
    nextRxId: () => `RX-${2500 + seq++}`,
  };
};

describe("mapRxMessageToPrescription", () => {
  it("maps an inbound message onto the Prescription shape", () => {
    const msg = parseNewRx(SAMPLE_NEW_RX);
    const rx = mapRxMessageToPrescription(msg, makeCtx());
    expect(rx.id).toMatch(/^RX-\d+$/);
    expect(rx.patient).toBe("Amara Diallo");
    expect(rx.productId).toBe("los50");
    expect(rx.qty).toBe(2);
    expect(rx.prescriberId).toBe("DR-01");
    expect(rx.status).toBe("new");
    expect(rx.daysSupply).toBe(30);
    expect(rx.note).toBe("Take 1 tablet daily");
    expect(rx.phone).toBe("555-321-9044");
    expect(rx.createdAt).toBeTypeOf("number");
    expect(Number.isFinite(rx.createdAt)).toBe(true);
  });

  it("age is derived from DateOfBirth", () => {
    const msg = parseNewRx(SAMPLE_NEW_RX);
    const rx = mapRxMessageToPrescription(msg, makeCtx());
    expect(rx.age).toBeGreaterThan(0);
    expect(Number.isInteger(rx.age)).toBe(true);
  });

  it("throws when the prescriber NPI is not in the directory", () => {
    const msg = parseNewRx(SAMPLE_NEW_RX);
    const ctx = makeCtx();
    ctx.resolvePrescriberId = () => undefined;
    expect(() => mapRxMessageToPrescription(msg, ctx)).toThrow(/No prescriber directory entry/);
  });

  it("falls back to drug description when NDC is absent", () => {
    const xml = SAMPLE_NEW_RX.replace(/<DrugCoded>[\s\S]*?<\/DrugCoded>/, "<DrugCoded></DrugCoded>");
    const msg = parseNewRx(xml);
    const rx = mapRxMessageToPrescription(msg, makeCtx());
    expect(rx.productId).toBe("los50");
  });

  it("round-trips: parse → map → build preserves patient name & directions", () => {
    const msg = parseNewRx(SAMPLE_NEW_RX);
    const rx = mapRxMessageToPrescription(msg, makeCtx());

    const bctx: RxBuildContext = {
      patient: msg.patient,
      product: { name: "Losartan 50mg", ndc: "68258-8945-01" },
      prescriber: { npi: "1234567890", dea: "X1234567", name: "R. Vance", credentials: "MD" },
    };
    const xml = buildNewRxMessage(rx, bctx);
    expect(xml).toContain("Amara");
    expect(xml).toContain("Diallo");
    expect(xml).toContain("Take 1 tablet daily");
    expect(xml).toContain("1234567890");
    expect(xml).toContain("68258-8945-01");
    const round = parseNewRx(xml);
    expect(round.patient.firstName).toBe("Amara");
    expect(round.patient.lastName).toBe("Diallo");
    expect(round.prescriber.npi).toBe("1234567890");
    expect(round.medication.quantity).toBe(2);
  });
});

describe("buildNewRxMessage", () => {
  const bctx: RxBuildContext = {
    patient: { lastName: "Diallo", firstName: "Amara", gender: "F", dob: "1983-04-12", phone: "555-321-9044" },
    product: { name: "Losartan 50mg", ndc: "68258-8945-01" },
    prescriber: { npi: "1234567890", dea: "X1234567", name: "R. Vance", credentials: "MD" },
    sender: { ncpdpId: "9876543", name: "Main Street Pharmacy" },
  };

  it("builds a valid SCRIPT XML string from a Prescription + context", () => {
    const xml = buildNewRxMessage(BASE_RX, bctx);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain("<NewRx>");
    expect(xml).toContain("9876543");
    expect(xml).toContain("Amara");
    expect(xml).toContain("Diallo");
    expect(xml).toContain("68258-8945-01");
    expect(xml).toContain("Losartan 50mg");
    expect(xml).toContain("<Value>2</Value>");
    expect(xml).toContain("Take 1 tablet daily");
    expect(xml).toContain("1234567890");
    expect(xml).toContain("X1234567");
    expect(xml).toContain("Vance");
    expect(xml).toContain("CounterRx");
  });

  it("round-trips directions through build → parse", () => {
    const withDirections: Prescription = { ...BASE_RX, note: "Take with water, twice daily" };
    const xml = buildNewRxMessage(withDirections, bctx);
    const msg: RxMessage = parseNewRx(xml);
    expect(msg.medication.directions).toBe("Take with water, twice daily");
  });

  it("escapes special XML characters in patient name and directions", () => {
    const esc: RxBuildContext = {
      patient: { lastName: "O'Brien & Sons", firstName: "A&B" },
      product: { name: "Amoxicillin <500mg>", ndc: "00173-0682-20" },
      prescriber: { npi: "1", dea: "A1", name: "Dr. <Smith>", credentials: "MD" },
    };
    const xml = buildNewRxMessage(BASE_RX, esc);
    expect(xml).toContain("O&apos;Brien &amp; Sons");
    expect(xml).toContain("A&amp;B");
    const msg = parseNewRx(xml);
    expect(msg.patient.lastName).toBe("O'Brien & Sons");
    expect(msg.patient.firstName).toBe("A&B");
  });
});
