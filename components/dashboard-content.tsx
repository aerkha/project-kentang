"use client";

import { useMemo } from "react";
import { useInvestors } from "@/lib/investors-context";
import { useBrokers } from "@/lib/brokers-context";
import { useMou } from "@/lib/mou-context";
import { useTransaksi, calcTransaksi } from "@/lib/transaksi-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DollarSign,
  Users,
  Briefcase,
  TrendingUp,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ComposedChart,
  Line,
  Legend,
  LabelList,
} from "recharts";

const COLORS = ["#2d6a4f", "#d4a574", "#c44536", "#4a90a4", "#8b5cf6", "#f59e0b", "#10b981"];
const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

function monthLabel(ym: string) {
  const [year, month] = ym.split("-");
  return `${MONTHS[parseInt(month) - 1]} ${year}`;
}

function formatShort(n: number) {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000_000)     return `${(n / 1_000_000).toFixed(0)}Jt`;
  if (Math.abs(n) >= 1_000)         return `${(n / 1_000).toFixed(0)}Rb`;
  return String(n);
}

export function DashboardContent() {
  const { investors }   = useInvestors();
  const { brokers }     = useBrokers();
  const { mous }        = useMou();
  const { transaksis }  = useTransaksi();

  // ── Portfolio metrics (hanya investor aktif) ──
  const metrics = useMemo(() => {
    const activeInvestors = investors.filter((inv) => inv.isActive !== false);
    const totalInvestors  = activeInvestors.length;
    const totalInvestment = activeInvestors.reduce((sum, inv) => sum + inv.investmentAmount, 0);
    const avgInvestment   = totalInvestors > 0 ? totalInvestment / totalInvestors : 0;
    const totalBrokers    = brokers.length;
    return { totalInvestors, totalInvestment, avgInvestment, totalBrokers };
  }, [investors, brokers]);


  // ── Chart: investasi per broker ──
  const brokerData = useMemo(() => {
    const map = new Map<string, number>();
    investors.forEach((inv) => {
      map.set(inv.brokerName, (map.get(inv.brokerName) ?? 0) + inv.investmentAmount);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [investors]);

  // ── Chart: investasi per pekerjaan ──
  const occupationData = useMemo(() => {
    const map = new Map<string, number>();
    investors.forEach((inv) => {
      map.set(inv.occupation, (map.get(inv.occupation) ?? 0) + inv.investmentAmount);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [investors]);

  // ── Chart: investasi masuk per bulan (dari MoU) ──
  const monthlyMouData = useMemo(() => {
    const map = new Map<string, { month: string; investment: number; count: number }>();
    mous.forEach((m) => {
      const ym    = m.date.slice(0, 7);
      const label = monthLabel(ym);
      if (!map.has(ym)) map.set(ym, { month: label, investment: 0, count: 0 });
      const e = map.get(ym)!;
      e.investment += m.investmentAmount;
      e.count      += 1;
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [mous]);

  // ── Chart: PnL per bulan (dari Transaksi) ──
  const monthlyPnlData = useMemo(() => {
    const map = new Map<string, { month: string; income: number; profit: number }>();
    transaksis.forEach((t) => {
      const c     = calcTransaksi(t);
      const ym    = t.date.slice(0, 7);
      const label = monthLabel(ym);
      if (!map.has(ym)) map.set(ym, { month: label, income: 0, profit: 0 });
      const e = map.get(ym)!;
      e.income  += c.income;
      e.profit  += c.profit;
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [transaksis]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: "12px",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytical Dashboard</h1>
        <p className="text-muted-foreground">Monitor kinerja investasi dan portofolio</p>
      </div>

      {/* ── Ringkasan Portofolio ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Investor</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalInvestors}</div>
            <p className="text-xs text-muted-foreground">investor aktif</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Investasi</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics.totalInvestment)}</div>
            <p className="text-xs text-muted-foreground">dari investor aktif</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rata-rata Investasi</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics.avgInvestment)}</div>
            <p className="text-xs text-muted-foreground">per investor</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jumlah Broker</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalBrokers}</div>
            <p className="text-xs text-muted-foreground">broker terdaftar</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Chart: Investasi Masuk per Bulan + PnL per Bulan ── */}
      {(monthlyMouData.length > 0 || monthlyPnlData.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2">

          {/* Investasi masuk per bulan */}
          {monthlyMouData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Investasi Masuk per Bulan</CardTitle>
                <CardDescription>
                  Total nilai dan jumlah MoU baru tiap bulan
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={monthlyMouData}
                      margin={{ top: 20, right: 20, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis
                        tickFormatter={formatShort}
                        tick={{ fontSize: 11 }}
                        width={52}
                      />
                      <Tooltip
                        formatter={(value, name) =>
                          name === "investment"
                            ? [formatCurrency(value as number), "Total Investasi"]
                            : [value, "Jumlah MoU"]
                        }
                        contentStyle={tooltipStyle}
                        labelStyle={{ color: "hsl(var(--card-foreground))" }}
                      />
                      <Bar
                        dataKey="investment"
                        fill="hsl(var(--chart-1))"
                        radius={[4, 4, 0, 0]}
                        name="investment"
                      >
                        <LabelList
                          dataKey="count"
                          position="top"
                          formatter={(v: number) => `${v} MoU`}
                          style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* PnL per bulan */}
          {monthlyPnlData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>PnL per Bulan</CardTitle>
                <CardDescription>
                  Penjualan, harga pokok, dan laba bersih tiap bulan
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={monthlyPnlData}
                      margin={{ top: 8, right: 20, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis
                        tickFormatter={formatShort}
                        tick={{ fontSize: 11 }}
                        width={52}
                      />
                      <Tooltip
                        formatter={(value, name) => {
                          const labels: Record<string, string> = {
                            income: "Income",
                            profit: "Profit",
                          };
                          return [formatCurrency(value as number), labels[name as string] ?? name];
                        }}
                        contentStyle={tooltipStyle}
                      />
                      <Legend
                        formatter={(value) => {
                          const labels: Record<string, string> = {
                            income: "Income",
                            profit: "Profit",
                          };
                          return labels[value] ?? value;
                        }}
                        wrapperStyle={{ fontSize: "11px" }}
                      />
                      <Bar dataKey="income" fill="#4ade80" radius={[3, 3, 0, 0]} name="income" />
                      <Line
                        type="monotone"
                        dataKey="profit"
                        stroke="#f59e0b"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: "#f59e0b" }}
                        name="profit"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Chart: Per broker & per pekerjaan ── */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Investasi per Broker</CardTitle>
            <CardDescription>Total nilai investasi berdasarkan broker</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={brokerData} margin={{ top: 5, right: 20, left: 8, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={formatShort} tick={{ fontSize: 11 }} width={52} />
                  <Tooltip
                    formatter={(value) => [formatCurrency(value as number), "Investasi"]}
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: "hsl(var(--card-foreground))" }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="hsl(var(--chart-1))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Investasi per Pekerjaan</CardTitle>
            <CardDescription>Distribusi investasi berdasarkan pekerjaan investor</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={occupationData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {occupationData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [formatCurrency(value as number), "Investasi"]}
                    contentStyle={tooltipStyle}
                  />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Investor Table ── */}
      <Card>
        <CardHeader>
          <CardTitle>Detail Investor</CardTitle>
          <CardDescription>Daftar lengkap investor dan nilai investasi</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">ID</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Investor</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Broker</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Pekerjaan</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">No HP</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Nilai Investasi</th>
                </tr>
              </thead>
              <tbody>
                {investors.map((investor) => (
                  <tr
                    key={investor.id}
                    className="border-b border-border/50 hover:bg-muted/50 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{investor.id}</td>
                    <td className="py-3 px-4 font-medium">{investor.name}</td>
                    <td className="py-3 px-4 text-muted-foreground">{investor.brokerName}</td>
                    <td className="py-3 px-4 text-muted-foreground">{investor.occupation}</td>
                    <td className="py-3 px-4 text-muted-foreground">{investor.phone}</td>
                    <td className="py-3 px-4 text-right font-medium">
                      {formatCurrency(investor.investmentAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
