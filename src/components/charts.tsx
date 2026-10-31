"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { money } from "@/lib/utils";

export interface Slice {
  name: string;
  value: number;
  amount: number;
}

const COLORS = ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#0ea5e9"];

export function SplitPie({ data }: { data: Slice[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={92}
            paddingAngle={2}
            stroke="#fff"
            strokeWidth={2}
          >
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: unknown, _name: unknown, item: unknown) => {
              const payload = (item as { payload?: Slice } | undefined)?.payload;
              return [
                `${value}% · ${money(payload?.amount ?? 0)}`,
                "Share",
              ] as [string, string];
            }}
          />
          <Legend
            formatter={(value: unknown) => {
              const name = String(value);
              const slice = data.find((d) => d.name === name);
              const share = slice ? Math.round(total ? (slice.value / total) * 100 : 0) : 0;
              return `${name} (${share}%)`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
