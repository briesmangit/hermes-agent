import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  BarChart3,
  KeyRound,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import type { CredentialPoolProviderUi } from "@/lib/api";
import { Button } from "@nous-research/ui/ui/components/button";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@nous-research/ui/ui/components/card";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { usePageHeader } from "@/contexts/usePageHeader";
import { useI18n } from "@/i18n";

function StatusBadge({ count, status }: { count: number; status: string }) {
  const variant =
    status === "active"
      ? "success"
      : status === "exhausted"
        ? "warning"
        : "destructive";

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground capitalize">{status}</span>
      <Badge tone={variant}>{count}</Badge>
    </div>
  );
}

function ProviderRow({ provider }: { provider: CredentialPoolProviderUi }) {
  const { t } = useI18n();
  const { active, exhausted, revoked } = provider.counts;
  const total = active + exhausted + revoked;

  return (
    <tr className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
      <td className="py-3 pr-4">
        <span className="font-mono-ui text-sm">{provider.provider}</span>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <StatusBadge count={active} status="active" />
          <StatusBadge count={exhausted} status="exhausted" />
          <StatusBadge count={revoked} status="revoked" />
        </div>
      </td>
      <td className="py-3 px-4 text-right">
        <span className="font-mondwest text-sm text-muted-foreground">
          {provider.total_requests.toLocaleString()}
        </span>
      </td>
      <td className="py-3 pl-4 text-right">
        <span className="font-mondwest text-xs text-muted-foreground">
          {provider.strategy}
        </span>
      </td>
    </tr>
  );
}

export default function CredentialPoolPage() {
  const [providers, setProviders] = useState<CredentialPoolProviderUi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();
  const { setEnd, setAfterTitle } = usePageHeader();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .getCredentialPoolUi()
      .then((res) => setProviders(res.providers ?? []))
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  useLayoutEffect(() => {
    setAfterTitle(null);
    setEnd(
      loading ? null : (
        <Button
          type="button"
          ghost
          size="icon"
          className="text-muted-foreground hover:text-foreground"
          onClick={load}
          disabled={loading}
          aria-label={t.common.refresh}
        >
          {loading ? <Spinner /> : <RefreshCw />}
        </Button>
      ),
    );
    return () => {
      setAfterTitle(null);
      setEnd(null);
    };
  }, [loading, load, setAfterTitle, setEnd, t.common.refresh]);

  useEffect(() => {
    load();
  }, [load]);

  const totalActive = providers.reduce(
    (sum, p) => sum + p.counts.active,
    0,
  );
  const totalExhausted = providers.reduce(
    (sum, p) => sum + p.counts.exhausted,
    0,
  );
  const totalRevoked = providers.reduce(
    (sum, p) => sum + p.counts.revoked,
    0,
  );
  const totalRequests = providers.reduce(
    (sum, p) => sum + p.total_requests,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Credential Pool</CardTitle>
          </div>
          <CardDescription>
            Overview of API keys and tokens across providers. Shows active, exhausted,
            and revoked credentials with cumulative request counts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-success" />
              <div>
                <div className="font-mondwest text-xs text-muted-foreground">
                  Active
                </div>
                <div className="text-2xl font-semibold">{totalActive}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-warning" />
              <div>
                <div className="font-mondwest text-xs text-muted-foreground">
                  Exhausted
                </div>
                <div className="text-2xl font-semibold">{totalExhausted}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              <div>
                <div className="font-mondwest text-xs text-muted-foreground">
                  Revoked
                </div>
                <div className="text-2xl font-semibold">{totalRevoked}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-mondwest text-xs text-muted-foreground">
                  Total Requests
                </div>
                <div className="text-2xl font-semibold">
                  {totalRequests.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Provider Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Spinner />
            </div>
          )}

          {error && (
            <div className="py-8 text-center text-sm text-destructive">
              {t.status.error}: {error}
            </div>
          )}

          {!loading && !error && providers.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No credential pool entries configured. Add API keys via{" "}
              <span className="font-mono-ui">hermes auth add</span> or through the
              Keys tab.
            </div>
          )}

          {!loading && !error && providers.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full font-mondwest normal-case text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs">
                    <th className="text-left py-2 pr-4 font-medium">Provider</th>
                    <th className="text-left py-2 px-4 font-medium">
                      Status Distribution
                    </th>
                    <th className="text-right py-2 px-4 font-medium">
                      Total Requests
                    </th>
                    <th className="text-right py-2 pl-4 font-medium">Strategy</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.map((p) => (
                    <ProviderRow key={p.provider} provider={p} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}