import { useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { usePos } from "../store";
import { can, type Organization } from "../data";
import i18n from "../i18n";

import { cx, Badge } from "../ui";
import { toCsv } from "../lib/export";
import {
  IGear, IPrint, IStar, IUsers, IDownload, IPlus, IX, ICheck, ITrash, IRecall, IAlert, IScan, IChevD, IClockIn, IPill, IEdit, ITag, IShield, ICopy, IUpload, IBell, ICash, IPause, ISearch, IArrowIn, IArrowOut,
} from "../icons";

type PlatformTab = "orgs" | "provision";

export default function PlatformAdmin() {
  const { t } = useTranslation();
  const { state, dispatch } = usePos();
  const [tab, setTab] = useState<PlatformTab>("orgs");
  const [provisionStep, setProvisionStep] = useState(1);
  const [provisionData, setProvisionData] = useState({
    orgName: "",
    ownerEmail: "",
    ownerName: "",
    ownerPin: "",
    catalogFile: null as File | null,
    catalogPreview: null as any[] | null,
    catalogHeaders: [] as string[],
    catalogMappings: {} as Record<string, string>,
  });

  const isSuper = can(state.user?.role, "platform_admin");
  if (!isSuper) {
    return (
      <div className="p-6 text-center text-inksoft">
        <IShield size={32} className="mx-auto text-mist mb-2" />
        <p className="text-sm">{t("platform.accessDenied")}</p>
      </div>
    );
  }

  const orgs = state.organizations ?? [];

  const orgRows = useMemo(() => orgs.map((o) => ({
    id: o.id,
    name: o.name,
    owner: o.ownerEmail ?? "—",
    status: o.status,
    claimsMode: o.claimsMode,
    ndcLiveLookup: o.ndcLiveLookup,
    deliveryEnabled: o.deliveryEnabled,
    aiEnabled: o.aiEnabled,
    createdAt: o.createdAt,
  })), [orgs]);

  const handleSuspend = useCallback((orgId: string, suspend: boolean) => {
    const org = orgs.find((o) => o.id === orgId);
    if (!org) return;
    dispatch({ type: "ORG_SET_STATUS", id: orgId, status: suspend ? "suspended" : "active" });
  }, [orgs, dispatch]);

  const handleFlagChange = useCallback((orgId: string, flag: keyof Organization, value: any) => {
    dispatch({ type: "ORG_SET_FLAGS", id: orgId, patch: { [flag]: value } as Partial<Pick<Organization, "claimsMode" | "ndcLiveLookup" | "deliveryEnabled" | "aiEnabled">> });
  }, [dispatch]);

  // Provision wizard handlers
  const handleCatalogUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const lines = text.trim().split("\n");
        const headers = lines[0].split(",").map((h) => h.trim());
        const preview = lines.slice(1, 6).map((line) => {
          const vals = line.split(",").map((v) => v.trim());
          return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
        });
        setProvisionData((d) => ({
          ...d,
          catalogFile: file,
          catalogPreview: preview,
          catalogHeaders: headers,
          catalogMappings: Object.fromEntries(headers.map((h) => [h, ""])),
        }));
      } catch (err) {
        alert(t("platform.catalogParseError"));
      }
    };
    reader.readAsText(file);
  };

  const handleProvisionSubmit = () => {
    // Step 1: org info validation
    if (provisionStep === 1) {
      if (!provisionData.orgName || !provisionData.ownerEmail || !provisionData.ownerName || !provisionData.ownerPin) {
        alert(t("platform.fillAllFields"));
        return;
      }
      setProvisionStep(2);
    } else if (provisionStep === 2) {
      // Step 2: catalog mapping - for now just create org, catalog import is async
      const newOrgId = crypto.randomUUID();
      const now = Date.now();
      dispatch({
        type: "ORG_PROVISION",
        org: {
          id: newOrgId,
          name: provisionData.orgName,
          ownerEmail: provisionData.ownerEmail,
          status: "active",
          createdAt: now,
          claimsMode: "sandbox",
          ndcLiveLookup: true,
          deliveryEnabled: false,
          aiEnabled: false,
        },
        products: [],
      });
      // TODO: create owner staff, import catalog
      setProvisionStep(1);
      setProvisionData({
        orgName: "", ownerEmail: "", ownerName: "", ownerPin: "",
        catalogFile: null, catalogPreview: null, catalogHeaders: [], catalogMappings: {},
      });
      setTab("orgs");
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display font-bold text-xl lg:text-2xl text-ink">{t("platform.title")}</h1>
        <div className="flex gap-2">
          <button
            className={cx("px-3 py-1.5 rounded-lg text-xs font-medium transition", tab === "orgs" ? "bg-pine-700 text-pine-50" : "bg-mist text-ink hover:bg-mist/80")}
            onClick={() => setTab("orgs")}
          >
            <IUsers size={12} className="inline me-1" /> {t("platform.orgsTab")}
          </button>
          <button
            className={cx("px-3 py-1.5 rounded-lg text-xs font-medium transition", tab === "provision" ? "bg-pine-700 text-pine-50" : "bg-mist text-ink hover:bg-mist/80")}
            onClick={() => { setProvisionStep(1); setTab("provision"); }}
          >
            <IPlus size={12} className="inline me-1" /> {t("platform.provisionTab")}
          </button>
        </div>
      </div>

      {tab === "orgs" && (
        <div className="bg-paper rounded-xl border border-mist overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-mist bg-mist/30">
                <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-inksoft">{t("platform.orgName")}</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-inksoft">{t("platform.owner")}</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-inksoft">{t("platform.statusLabel")}</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-inksoft">{t("platform.claimsModeLabel")}</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-inksoft">{t("platform.ndcLiveLookup")}</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-inksoft">{t("platform.deliveryEnabled")}</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-inksoft">{t("platform.aiEnabled")}</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-inksoft">{t("platform.createdAt")}</th>
                <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-inksoft">{t("platform.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {orgRows.map((o) => (
                <tr key={o.id} className="border-b border-mist/50 hover:bg-mist/30">
                  <td className="px-4 py-2 font-medium text-ink">{o.name}</td>
                  <td className="px-4 py-2 text-sm text-inksoft">{o.owner}</td>
                  <td className="px-4 py-2">
                    <Badge tone={o.status === "active" ? "pine" : "honey"}>
                      {t(`platform.status.${o.status}`)}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    <select value={o.claimsMode} onChange={(e) => handleFlagChange(o.id, "claimsMode", e.target.value)} className="w-32">
                      <option value="sandbox">{t("platform.claimsMode.sandbox")}</option>
                      <option value="live">{t("platform.claimsMode.live")}</option>
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={o.ndcLiveLookup}
                      onChange={(e) => handleFlagChange(o.id, "ndcLiveLookup", e.target.checked)}
                      className="w-4 h-4 rounded border-mist text-pine-700"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={o.deliveryEnabled}
                      onChange={(e) => handleFlagChange(o.id, "deliveryEnabled", e.target.checked)}
                      className="w-4 h-4 rounded border-mist text-pine-700"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={o.aiEnabled}
                      onChange={(e) => handleFlagChange(o.id, "aiEnabled", e.target.checked)}
                      className="w-4 h-4 rounded border-mist text-pine-700"
                    />
                  </td>
                  <td className="px-4 py-2 text-sm text-inksoft">
                    {new Date(o.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => handleSuspend(o.id, o.status === "active")}
                      className={cx("px-2 py-1 rounded text-[10px] font-medium transition", o.status === "active" ? "bg-rose-100 text-rose-700 hover:bg-rose-200" : "bg-pine-100 text-pine-700 hover:bg-pine-200")}
                    >
                      {o.status === "active" ? (
                        <>
                          <IPause size={10} className="inline me-0.5" />
                          {t("platform.suspend")}
                        </>
                      ) : (
                        <>
                          <ICheck size={10} className="inline me-0.5" />
                          {t("platform.activate")}
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "provision" && (
        <div className="space-y-6">
          <div className="flex gap-2 mb-4">
            {[
              { step: 1, label: t("platform.provisionStep1") },
              { step: 2, label: t("platform.provisionStep2") },
            ].map((s) => (
              <button
                key={s.step}
                className={cx("flex-1 py-2 rounded-lg text-sm font-medium transition", provisionStep === s.step ? "bg-pine-700 text-pine-50" : "bg-mist text-ink")}
                onClick={() => setProvisionStep(s.step)}
                disabled={provisionStep < s.step}
              >
                {s.label}
              </button>
            ))}
          </div>

          {provisionStep === 1 && (
            <div className="bg-paper rounded-xl border border-mist p-6 space-y-4 max-w-xl">
              <h3 className="font-bold text-ink">{t("platform.orgInfo")}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-medium text-inksoft mb-1">{t("platform.orgName")}</label>
                  <input type="text"
                    value={provisionData.orgName}
                    onChange={(e) => setProvisionData({ ...provisionData, orgName: e.target.value })}
                    placeholder={t("platform.orgNamePlaceholder")}
                    className="w-full px-3 py-2.5 rounded-lg border border-mist bg-card text-sm text-ink focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-200 transition" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-inksoft mb-1">{t("platform.ownerEmail")}</label>
                  <input type="email"
                    value={provisionData.ownerEmail}
                    onChange={(e) => setProvisionData({ ...provisionData, ownerEmail: e.target.value })}
                    placeholder={t("platform.ownerEmailPlaceholder")}
                    className="w-full px-3 py-2.5 rounded-lg border border-mist bg-card text-sm text-ink focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-200 transition" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-inksoft mb-1">{t("platform.ownerName")}</label>
                  <input type="text"
                    value={provisionData.ownerName}
                    onChange={(e) => setProvisionData({ ...provisionData, ownerName: e.target.value })}
                    placeholder={t("platform.ownerNamePlaceholder")}
                    className="w-full px-3 py-2.5 rounded-lg border border-mist bg-card text-sm text-ink focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-200 transition" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-inksoft mb-1">{t("platform.ownerPin")}</label>
                  <input type="password"
                    value={provisionData.ownerPin}
                    onChange={(e) => setProvisionData({ ...provisionData, ownerPin: e.target.value })}
                    placeholder={t("platform.ownerPinPlaceholder")}
                    className="w-full px-3 py-2.5 rounded-lg border border-mist bg-card text-sm text-ink focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-200 transition" />
                </div>
              </div>
              <button
                className="w-full py-2 rounded-lg bg-pine-700 text-pine-50 font-medium hover:bg-pine-600 transition"
                onClick={handleProvisionSubmit}
              >
                <IArrowIn size={12} className="inline me-1" /> {t("platform.next")}
              </button>
            </div>
          )}

          {provisionStep === 2 && (
            <div className="bg-paper rounded-xl border border-mist p-6 space-y-4 max-w-3xl">
              <h3 className="font-bold text-ink">{t("platform.catalogImport")}</h3>
              <p className="text-sm text-inksoft">{t("platform.catalogImportHint")}</p>
              <div className="border-2 border-dashed border-mist rounded-lg p-6 text-center">
                <IUpload size={24} className="mx-auto text-mist mb-2" />
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCatalogUpload}
                  className="hidden"
                  id="catalog-upload"
                />
                <label htmlFor="catalog-upload" className="cursor-pointer">
                  <p className="text-ink">{t("platform.uploadCsv")}</p>
                  <p className="text-sm text-inksoft">{t("platform.csvHint")}</p>
                </label>
              </div>
              {provisionData.catalogPreview && (
                <div className="space-y-2">
                  <h4 className="font-medium text-ink">{t("platform.columnMapping")}</h4>
                  <div className="grid gap-2 sm:grid-cols-2 max-h-64 overflow-auto">
                    {provisionData.catalogHeaders.map((h) => (
                      <div key={h} className="flex items-center gap-2">
                        <span className="text-sm text-inksoft w-32 truncate">{h}</span>
                        <select value={provisionData.catalogMappings[h] || ""} onChange={(e) => setProvisionData({ ...provisionData, catalogMappings: { ...provisionData.catalogMappings, [h]: e.target.value } })} className="flex-1">
                          <option value="">{t("platform.skipColumn")}</option>
                          <option value="name">{t("platform.mapName")}</option>
                          <option value="sku">{t("platform.mapSku")}</option>
                          <option value="ndc">{t("platform.mapNdc")}</option>
                          <option value="category">{t("platform.mapCategory")}</option>
                          <option value="price">{t("platform.mapPrice")}</option>
                          <option value="cost">{t("platform.mapCost")}</option>
                          <option value="qty">{t("platform.mapQty")}</option>
                        </select>
                      </div>
                    ))}
                  </div>
                  <div className="text-right">
                    <button
                      className="py-2 px-4 rounded-lg bg-pine-700 text-pine-50 font-medium hover:bg-pine-600 transition"
                      onClick={handleProvisionSubmit}
                    >
                      <IShield size={12} className="inline me-1" /> {t("platform.createOrg")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Provision wizard modal removed - using inline stepper */}
    </div>
  );
}