
import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  CreditCard,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";

import { supabase } from "../../lib/supabase";

type GatewayType = "mercadopago" | "bravopay" | "revantpay";

interface GatewaySettingsResponse {
  active_gateway?: GatewayType;
}

interface ApiResponse {
  error?: string;
  settings?: GatewaySettingsResponse;
  data?: GatewaySettingsResponse;
  active_gateway?: GatewayType;
}

const GATEWAYS: {
  id: GatewayType;
  name: string;
  description: string;
}[] = [
  {
    id: "mercadopago",
    name: "Mercado Pago",
    description:
      "Gateway atualmente integrado à ILUME. Mantém o processamento de pagamentos já implementado.",
  },
  {
    id: "bravopay",
    name: "BravoPay",
    description:
      "Segundo provedor de pagamentos. A integração deve estar operacional no servidor antes da ativação.",
  },
  {
    id: "revantpay",
    name: "Revant Pay",
    description:
      "Checkout hospedado pela Revant Pay. A confirmação automática de pagamentos está pendente.",
  },
];

export default function GatewaySettings() {
  const [activeGateway, setActiveGateway] =
    useState<GatewayType | null>(null);

  const [pendingGateway, setPendingGateway] =
    useState<GatewayType | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function getAccessToken(): Promise<string> {
    const { data, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    const token = data.session?.access_token;

    if (!token) {
      throw new Error(
        "Sessão não encontrada. Entre novamente no painel administrativo."
      );
    }

    return token;
  }

  async function readApiResponse(
    response: Response
  ): Promise<ApiResponse> {
    const result = await response.json().catch(() => null);

    if (!result || typeof result !== "object") {
      throw new Error("O servidor retornou uma resposta inválida.");
    }

    if (!response.ok) {
      throw new Error(
        typeof result.error === "string"
          ? result.error
          : `Erro do servidor (${response.status}).`
      );
    }

    return result as ApiResponse;
  }

  async function loadGatewaySettings() {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const token = await getAccessToken();

      const response = await fetch("/api/admin/payment-settings", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await readApiResponse(response);

      const settings =
        result.settings ||
        result.data ||
        result;

      const gateway = settings.active_gateway;

      if (
        gateway !== "mercadopago" &&
        gateway !== "bravopay" &&
        gateway !== "revantpay"
      ) {
        throw new Error(
          "O servidor não retornou um gateway válido."
        );
      }

      setActiveGateway(gateway);
      setPendingGateway(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar as configurações."
      );
    } finally {
      setLoading(false);
    }
  }

  async function saveGatewaySettings() {
    if (!pendingGateway || saving) {
      return;
    }

    const selectedGateway = pendingGateway;
    const selectedName = GATEWAYS.find(
      (gateway) => gateway.id === selectedGateway
    )?.name;

    const confirmed = window.confirm(
      `Deseja realmente ativar o ${selectedName}?\n\n` +
        "Essa alteração define qual gateway será utilizado para novos pagamentos. " +
        "Pagamentos e pedidos já criados não devem ser alterados." +
        (selectedGateway === "revantpay"
          ? "\n\nOs pedidos da Revant Pay ficarão pendentes na ILUME até que a confirmação automática seja integrada."
          : "")
    );

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const token = await getAccessToken();

      const response = await fetch("/api/admin/payment-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          active_gateway: selectedGateway,
        }),
      });

      const result = await readApiResponse(response);

      const returnedSettings =
        result.settings ||
        result.data ||
        result;

      const returnedGateway = returnedSettings.active_gateway;

      if (
        returnedGateway !== "mercadopago" &&
        returnedGateway !== "bravopay" &&
        returnedGateway !== "revantpay"
      ) {
        throw new Error(
          "O servidor não confirmou qual gateway foi salvo. Atualize a página e confira a configuração."
        );
      }

      setActiveGateway(returnedGateway);
      setPendingGateway(null);
      setSuccess(
        `Gateway alterado para ${
          GATEWAYS.find((gateway) => gateway.id === returnedGateway)
            ?.name
        }.`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível salvar a configuração."
      );
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void loadGatewaySettings();
  }, []);

  const activeGatewayInfo = GATEWAYS.find(
    (gateway) => gateway.id === activeGateway
  );

  return (
    <section className="gateway-section" id="gateway">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PAGAMENTOS</span>
          <h2>Gateway</h2>
          <p>
            Escolha qual provedor será utilizado para processar
            novos pagamentos da ILUME.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={loadGatewaySettings}
          disabled={loading || saving}
        >
          <RefreshCcw
            size={16}
            className={loading ? "is-spinning" : ""}
          />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="gateway-notice">
          <div className="panel-icon">
            <AlertCircle size={19} />
          </div>
          <div>
            <strong>Não foi possível concluir a operação</strong>
            <span>{error}</span>
          </div>
        </div>
      )}

      {success && (
        <div className="gateway-notice">
          <div className="panel-icon">
            <CheckCircle size={19} />
          </div>
          <div>
            <strong>Configuração atualizada</strong>
            <span>{success}</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="gateway-notice">
          <div className="panel-icon">
            <RefreshCcw size={19} className="is-spinning" />
          </div>
          <div>
            <strong>Carregando configuração</strong>
            <span>
              Consultando o gateway ativo no servidor.
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="gateway-notice">
            <div className="panel-icon">
              <CreditCard size={19} />
            </div>
            <div>
              <strong>Gateway ativo: {activeGatewayInfo?.name}</strong>
              <span>
                Este provedor está selecionado para novos pagamentos.
              </span>
            </div>
            <span className="gateway-tag">ATIVO</span>
          </div>

          <div className="gateway-grid">
            {GATEWAYS.map((gateway) => {
              const isActive = activeGateway === gateway.id;
              const isPending = pendingGateway === gateway.id;

              return (
                <article
                  className="gateway-card"
                  key={gateway.id}
                >
                  <div className="gateway-card-top">
                    <div className="panel-icon">
                      <CreditCard size={20} />
                    </div>

                    <span className="gateway-tag">
                      {isActive ? "Ativo" : "Disponível"}
                    </span>
                  </div>

                  <h3>{gateway.name}</h3>
                  <p>{gateway.description}</p>

                  <button
                    type="button"
                    className={
                      isActive
                        ? "secondary-button"
                        : "primary-button"
                    }
                    disabled={isActive || saving}
                    onClick={() => {
                      setError("");
                      setSuccess("");
                      setPendingGateway(gateway.id);
                    }}
                  >
                    {isActive
                      ? "Gateway em uso"
                      : isPending
                        ? "Selecionado"
                        : "Selecionar gateway"}
                  </button>
                </article>
              );
            })}
          </div>

          {pendingGateway && (
            <div className="gateway-notice">
              <div className="panel-icon">
                <AlertCircle size={19} />
              </div>

              <div>
                <strong>
                  Confirmar alteração para{" "}
                  {
                    GATEWAYS.find(
                      (gateway) => gateway.id === pendingGateway
                    )?.name
                  }
                  ?
                </strong>
                <span>
                  A alteração será gravada no banco de dados e aplicada
                  aos novos pagamentos após a integração do checkout
                  consultar essa configuração no servidor.
                </span>

                <div className="product-form-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setPendingGateway(null)}
                    disabled={saving}
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    className="primary-button"
                    onClick={saveGatewaySettings}
                    disabled={saving}
                  >
                    <CheckCircle size={16} />
                    {saving
                      ? "Salvando..."
                      : "Confirmar alteração"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="gateway-notice">
        <div className="panel-icon">
          <ShieldCheck size={19} />
        </div>
        <div>
          <strong>Segurança dos pagamentos</strong>
          <span>
            As chaves privadas dos provedores devem permanecer nas
            variáveis de ambiente do servidor. A confirmação de
            pagamentos deve ocorrer por validação no backend e webhook,
            nunca apenas pelo navegador.
          </span>
        </div>
      </div>

      <p className="gateway-footnote">
        A seleção do gateway não altera pagamentos antigos. A troca
        somente deve ser considerada operacional depois que o checkout
        estiver integrado à configuração salva no servidor.
      </p>
    </section>
  );
}
