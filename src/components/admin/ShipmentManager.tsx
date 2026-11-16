
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { RefreshCcw, Save, Truck, ExternalLink, Clock } from "lucide-react";
type ShipmentStatus =
  | "awaiting_confirmation"
  | "preparing"
  | "shipped"
  | "in_transit"
  | "delivered"
  | "cancelled";

interface Shipment {
  id: string;
  order_id: string;
  carrier: string | null;
  tracking_code: string | null;
  tracking_url: string | null;
  status: ShipmentStatus;
  notes: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ShipmentEvent {
  id: string;
  status: ShipmentStatus;
  description: string;
  created_at: string;
}

interface ShipmentManagerProps {
  orderId: string;
  orderStatus: string;
}

const STATUS_OPTIONS: { value: ShipmentStatus; label: string }[] = [
  { value: "awaiting_confirmation", label: "Aguardando confirmação" },
  { value: "preparing", label: "Em preparação" },
  { value: "shipped", label: "Enviado" },
  { value: "in_transit", label: "Em trânsito" },
  { value: "delivered", label: "Entregue" },
  { value: "cancelled", label: "Cancelado" },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label || status;
}

const fieldStyle: CSSProperties = {
  width: "100%",
  minHeight: 42,
  padding: "10px 12px",
  border: "1px solid var(--a-border, #343434)",
  borderRadius: 8,
  background: "var(--a-bg, #111)",
  color: "var(--a-text, #f5f5f5)",
  font: "inherit",
  boxSizing: "border-box",
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 6,
  color: "var(--a-muted, #aaa)",
  fontSize: 12,
  fontWeight: 600,
};

export default function ShipmentManager({ orderId, orderStatus }: ShipmentManagerProps) {
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [events, setEvents] = useState<ShipmentEvent[]>([]);
  const [status, setStatus] = useState<ShipmentStatus>("awaiting_confirmation");
  const [carrier, setCarrier] = useState("");
  const [trackingCode, setTrackingCode] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const paymentApproved = ["approved", "paid"].includes(
    String(orderStatus || "").toLowerCase()
  );

  async function getAccessToken() {
    const { data, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) throw sessionError;
    if (!data.session?.access_token) {
      throw new Error("Sua sessão expirou. Entre novamente no painel.");
    }

    return data.session.access_token;
  }

  async function loadShipment() {
    setLoading(true);
    setError("");

    try {
      const token = await getAccessToken();
      const response = await fetch(
        `/api/admin/shipments?orderId=${encodeURIComponent(orderId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Não foi possível carregar a logística.");
      }

      const currentShipment = (result.shipment || null) as Shipment | null;
      setShipment(currentShipment);
      setEvents((result.events || []) as ShipmentEvent[]);

      if (currentShipment) {
        setStatus(currentShipment.status);
        setCarrier(currentShipment.carrier || "");
        setTrackingCode(currentShipment.tracking_code || "");
        setTrackingUrl(currentShipment.tracking_url || "");
        setNotes(currentShipment.notes || "");
      } else {
        setStatus("awaiting_confirmation");
        setCarrier("");
        setTrackingCode("");
        setTrackingUrl("");
        setNotes("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar logística.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadShipment();
    // A consulta deve ser refeita quando o pedido exibido mudar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const token = await getAccessToken();
      const response = await fetch("/api/admin/shipments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          order_id: orderId,
          status,
          carrier: carrier.trim() || null,
          tracking_code: trackingCode.trim() || null,
          tracking_url: trackingUrl.trim() || null,
          description: description.trim() || null,
          notes: notes.trim() || null,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Não foi possível salvar a atualização.");
      }

      setDescription("");
      setNotice("Informações logísticas salvas com sucesso.");
      await loadShipment();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar logística.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="admin-panel" style={{ marginTop: 18 }}>
      <div className="panel-heading">
        <div className="panel-icon"><Truck size={19} /></div>
        <div>
          <h3>Logística e envio</h3>
          <p>Atualize o envio e acompanhe o histórico do pedido.</p>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={() => void loadShipment()}
          disabled={loading || saving}
          title="Atualizar logística"
          aria-label="Atualizar logística"
          style={{ marginLeft: "auto" }}
        >
          <RefreshCcw size={16} />
        </button>
      </div>

      <div className="panel-content">
        {loading && <p>Carregando informações logísticas...</p>}

        {!loading && error && (
          <p role="alert" style={{ color: "#e57373", margin: "0 0 12px" }}>{error}</p>
        )}

        {!loading && notice && (
          <p role="status" style={{ color: "var(--a-green, #70c99a)", margin: "0 0 12px" }}>{notice}</p>
        )}

        {!loading && shipment && (
          <div style={{ marginBottom: 16 }}>
            <span className="category-label">Status atual: </span>
            <strong>{statusLabel(shipment.status)}</strong>
            {shipment.shipped_at && (
              <p style={{ margin: "8px 0 0", color: "var(--a-muted, #aaa)", fontSize: 12 }}>
                Enviado em: {formatDate(shipment.shipped_at)}
              </p>
            )}
            {shipment.delivered_at && (
              <p style={{ margin: "4px 0 0", color: "var(--a-muted, #aaa)", fontSize: 12 }}>
                Entregue em: {formatDate(shipment.delivered_at)}
              </p>
            )}
          </div>
        )}

        {!loading && !paymentApproved && (
          <p style={{ color: "var(--a-amber, #d7ad62)", fontSize: 13 }}>
            A atualização logística será liberada quando o pagamento estiver aprovado.
          </p>
        )}

        {!loading && paymentApproved && (
          <form onSubmit={handleSave}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <div>
                <label htmlFor={`shipment-status-${orderId}`} style={labelStyle}>Status do envio</label>
                <select
                  id={`shipment-status-${orderId}`}
                  value={status}
                  onChange={(event) => setStatus(event.target.value as ShipmentStatus)}
                  style={fieldStyle}
                  required
                >
                  {STATUS_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`shipment-carrier-${orderId}`} style={labelStyle}>Transportadora</label>
                <input id={`shipment-carrier-${orderId}`} value={carrier} onChange={(event) => setCarrier(event.target.value)} maxLength={120} placeholder="Ex: Correios" style={fieldStyle} />
              </div>

              <div>
                <label htmlFor={`shipment-code-${orderId}`} style={labelStyle}>Código de rastreio</label>
                <input id={`shipment-code-${orderId}`} value={trackingCode} onChange={(event) => setTrackingCode(event.target.value)} maxLength={120} placeholder="Código de rastreio" style={fieldStyle} />
              </div>

              <div>
                <label htmlFor={`shipment-url-${orderId}`} style={labelStyle}>Link de rastreamento</label>
                <input id={`shipment-url-${orderId}`} type="url" value={trackingUrl} onChange={(event) => setTrackingUrl(event.target.value)} maxLength={1000} placeholder="https://..." style={fieldStyle} />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label htmlFor={`shipment-description-${orderId}`} style={labelStyle}>Descrição desta atualização</label>
                <input id={`shipment-description-${orderId}`} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} placeholder="Ex: Pedido enviado para transporte" style={fieldStyle} />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label htmlFor={`shipment-notes-${orderId}`} style={labelStyle}>Observações internas</label>
                <textarea id={`shipment-notes-${orderId}`} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={3} placeholder="Observações sobre o envio (opcional)" style={{ ...fieldStyle, resize: "vertical" }} />
              </div>
            </div>

            <button type="submit" className="primary-button full-button" disabled={saving || loading} style={{ marginTop: 14 }}>
              <Save size={16} />{saving ? "Salvando..." : "Salvar atualização logística"}
            </button>
          </form>
        )}

        {!loading && (
          <div style={{ marginTop: 22 }}>
            <div className="panel-heading" style={{ padding: 0, border: 0, marginBottom: 12 }}>
              <div className="panel-icon"><Clock size={17} /></div>
              <div><h3>Histórico do envio</h3><p>Movimentações registradas no sistema.</p></div>
            </div>

            {events.length > 0 ? (
              <div style={{ display: "grid", gap: 12 }}>
                {events.map((item) => (
                  <div key={item.id} style={{ borderLeft: "2px solid var(--a-accent, #c5a15a)", padding: "2px 0 4px 12px" }}>
                    <strong style={{ display: "block", fontSize: 13 }}>{statusLabel(item.status)}</strong>
                    <span style={{ display: "block", fontSize: 13, marginTop: 3 }}>{item.description}</span>
                    <small style={{ display: "block", color: "var(--a-muted, #aaa)", marginTop: 4 }}>{formatDate(item.created_at)}</small>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--a-muted, #aaa)", fontSize: 13 }}>Nenhuma movimentação logística registrada.</p>
            )}
          </div>
        )}

        {shipment?.tracking_url && (
          <a
            href={shipment.tracking_url}
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 16, color: "var(--a-accent, #c5a15a)", fontSize: 13 }}
          >
            Abrir rastreamento <ExternalLink size={14} />
          </a>
        )}

        {!shipment && !loading && (
          <p style={{ color: "var(--a-muted, #aaa)", fontSize: 12, marginTop: 12 }}>
            Ainda não existe um envio cadastrado para este pedido.
          </p>
        )}
      </div>
    </article>
  );
}
