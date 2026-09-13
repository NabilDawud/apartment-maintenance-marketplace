"use client";

import { ReactNode, useState } from "react";

type Tab = {
  id: string;
  label: string;
  content: ReactNode;
};

export default function DashboardTabs({ tabs }: { tabs: Tab[] }) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? "");
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <div>
      <div className="mb-6 flex gap-2 overflow-x-auto border-b border-[#dce8e1] pb-px" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active?.id === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`whitespace-nowrap rounded-t-xl px-5 py-3 text-sm font-bold transition ${
              active?.id === tab.id
                ? "border-b-4 border-[#0b5c3b] bg-[#e9f5ee] text-[#0b5c3b]"
                : "text-[#60756a] hover:bg-[#f2f8f4] hover:text-[#0b5c3b]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{active?.content}</div>
    </div>
  );
}
