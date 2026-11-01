import { useEffect, useState } from "react";
import { DEMO_BRIEF, DEMO_CARD_INPUT, DEMO_CARD_TEXT, parseCardText, programCard } from "@/lib/xianhua/script";
import { walkAudit, type AuditReport, type Dialect, type Posture } from "@/lib/xianhua/veil";
import { MEDIA_CONFIGS } from "@/lib/xianhua/media";
import { VERSE_SAMPLES } from "@/lib/xianhua/reel";
import { ReelPlayer } from "@/components/xianhua-reel";

const FALLBACK_CARD = programCard(DEMO_CARD_INPUT);

export function VeilPanel() {
  const [dialect, setDialect] = useState<Dialect>("speech");
  const [mediaId, setMediaId] = useState("series-dusk");
  const [posture, setPosture] = useState<Posture>("both");
  const [epoch, setEpoch] = useState("3");
  const [brief, setBrief] = useState(DEMO_BRIEF);
  const [language, setLanguage] = useState("中文");
  const [cardText, setCardText] = useState(DEMO_CARD_TEXT);
  const [modelUrl, setModelUrl] = useState("");
  const [modelName, setModelName] = useState("qwen2.5:7b");
  const [report, setReport] = useState<AuditReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function walk(next: { dialect?: Dialect; posture?: Posture; brief?: string; epoch?: string; mediaId?: string; language?: string } = {}) {
    const kind = next.dialect ?? dialect;
    const who = next.posture ?? posture;
    const text = next.brief ?? brief;
    const era = Number(next.epoch ?? epoch) || 1;
    setBusy(true);
    setError("");
    try {
      const card = kind === "program" ? parseCardText(cardText) : FALLBACK_CARD;
      const got = await walkAudit({
        posture: who,
        dialect: kind,
        briefText: text,
        card,
        epoch: era,
        language: next.language ?? language,
        mediaId: next.mediaId ?? mediaId,
        payload: "今天下午把窗口的草稿寄出，对方只需要看到一封平常的信。",
        remote: modelUrl.trim() ? { url: modelUrl.trim(), model: modelName.trim() || "local" } : null,
      });
      setReport(got);
    } catch (err) {
      setError(err instanceof Error ? err.message : "私稿没走通");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancel = false;
    walkAudit({
      posture: "both",
      dialect: "speech",
      briefText: DEMO_BRIEF,
      card: FALLBACK_CARD,
      epoch: 3,
      language: "中文",
      payload: "今天下午把窗口的草稿寄出，对方只需要看到一封平常的信。",
    })
      .then((got) => {
        if (!cancel) setReport(got);
      })
      .catch((err: unknown) => {
        if (!cancel) setError(err instanceof Error ? err.message : "私稿没走通");
      });
    return () => {
      cancel = true;
    };
  }, []);

  function download() {
    if (!report?.frozen) return;
    const blob = new Blob([JSON.stringify(report.frozen, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "surface.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="mt-10 grid gap-4 rounded-card border border-border bg-surface p-4">
      <div>
        <h2 className="text-xl text-fg">手里有程序，也读不出这套说法</h2>
        <p className="mt-2 text-sm text-muted">
          公开话题表留在程序里，只作对照。真正对外的句子来自私稿，模型只在换纪元时离线写一版，写完就冻住，两边各存同一份。线上不再问模型。观察者就算拿着程序，没有这份额外的成稿，对不上槽位。
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Choice
          active={dialect === "speech"}
          label="闲聊"
          note="私稿里的事，换着说法"
          onClick={() => {
            setDialect("speech");
            void walk({ dialect: "speech" });
          }}
        />
        <Choice
          active={dialect === "program"}
          label="程序"
          note="字段不动，附言是命令"
          onClick={() => {
            setDialect("program");
            void walk({ dialect: "program" });
          }}
        />
        <Choice
          active={dialect === "media"}
          label="媒体"
          note="一张张能看的卡片"
          onClick={() => {
            setDialect("media");
            void walk({ dialect: "media" });
          }}
        />
        <Choice
          active={dialect === "reel"}
          label="影像"
          note="四行一节，再交给下一件"
          onClick={() => {
            setDialect("reel");
            void walk({ dialect: "reel" });
          }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Choice
          active={posture === "none"}
          label="没有模型"
          note={dialect === "speech" ? "仍用程序里的话题表" : dialect === "media" ? "仍用私稿画卡片" : dialect === "reel" ? "句式按语言走，不叫模型" : "附言是命令，不写句子"}
          onClick={() => {
            setPosture("none");
            void walk({ posture: "none" });
          }}
        />
        <Choice
          active={posture === "one"}
          label="一端有模型"
          note="这一端写好两边的口气"
          onClick={() => {
            setPosture("one");
            void walk({ posture: "one" });
          }}
        />
        <Choice
          active={posture === "both"}
          label="两端都有"
          note="各写自己的出站，再交换"
          onClick={() => {
            setPosture("both");
            void walk({ posture: "both" });
          }}
        />
      </div>
      <label className="grid gap-2 text-sm text-muted">
        表面语言
        <input
          value={language}
          onChange={(e) => setLanguage(e.target.value.slice(0, 40))}
          className="h-11 rounded-card border border-border bg-bg px-3 text-base text-fg"
        />
        <span>
          {dialect === "reel"
            ? "影像上读到的是歌词。四行一节，第四节把这一件交给下一件。下面三套是不同语言的句式。"
            : "没有模型时，中文以外只是把私稿里的词接起来。连贯性要等模型来审，它不改字段，也不重写。"}
        </span>
      </label>
      {dialect === "reel" ? (
        <div className="flex flex-wrap gap-2">
          {VERSE_SAMPLES.map((sample) => (
            <Choice
              key={sample.id}
              active={language === sample.language}
              label={sample.label}
              note={sample.preview}
              onClick={() => {
                setLanguage(sample.language);
                setBrief(sample.brief);
                void walk({ dialect: "reel", brief: sample.brief, language: sample.language });
              }}
            />
          ))}
        </div>
      ) : null}
      <label className="grid gap-2 text-sm text-muted">
        私稿，不放进程序
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={5}
          className="w-full resize-y rounded-card border border-border bg-bg px-3 py-3 text-base text-fg"
        />
      </label>
      {dialect === "media" ? (
        <div className="flex flex-wrap gap-2">
          {MEDIA_CONFIGS.map((item) => (
            <Choice
              key={item.id}
              active={mediaId === item.id}
              label={item.label}
              note={item.note}
              onClick={() => {
                setMediaId(item.id);
                void walk({ dialect: "media", mediaId: item.id });
              }}
            />
          ))}
        </div>
      ) : null}
      {dialect === "program" ? (
        <label className="grid gap-2 text-sm text-muted">
          程序字段。左边是角色，名字和取值都可以改。操作和分类写成「名字 = 四个取值」。
          <textarea
            value={cardText}
            onChange={(e) => setCardText(e.target.value)}
            rows={7}
            className="w-full resize-y rounded-card border border-border bg-bg px-3 py-3 text-base text-fg"
          />
        </label>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm text-muted">
          纪元
          <input
            inputMode="numeric"
            value={epoch}
            onChange={(e) => setEpoch(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
            className="h-11 rounded-card border border-border bg-bg px-3 text-base text-fg"
          />
        </label>
        <label className="grid gap-1 text-sm text-muted sm:col-span-2">
          本地模型地址，可空
          <input
            value={modelUrl}
            onChange={(e) => setModelUrl(e.target.value)}
            placeholder="http://127.0.0.1:11434/v1/chat/completions"
            className="h-11 rounded-card border border-border bg-bg px-3 text-base text-fg"
          />
        </label>
      </div>
      <label className="grid gap-1 text-sm text-muted">
        模型名
        <input
          value={modelName}
          onChange={(e) => setModelName(e.target.value)}
          className="h-11 rounded-card border border-border bg-bg px-3 text-base text-fg"
        />
      </label>
      <p className="text-sm text-muted">
        推荐 7B 到 8B 的指令模型，四比特或五比特量化，例如 Qwen2.5 7B。3B 经常写坏「只填句子、不改字段」这份合同；14B 句子更稳，但成稿一旦冻住，再大的模型也不出现在线上。两边不要各跑一次模型指望字面相同，温度对不上。一端写好，把成稿交给对端。
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void walk()}
          disabled={busy}
          className="h-11 rounded-card bg-sage px-4 text-sage-ink disabled:opacity-50"
        >
          {busy ? "正在写表面…" : "用这版私稿走一遍"}
        </button>
        <button
          type="button"
          onClick={download}
          disabled={!report?.frozen}
          className="h-11 rounded-card border border-border px-4 text-fg disabled:opacity-50"
        >
          下载成稿
        </button>
      </div>
      {error ? <p className="text-sm text-ember">{error}</p> : null}
      {report ? <AuditView report={report} /> : <p className="text-sm text-muted">正在用默认私稿写一版。</p>}
    </section>
  );
}

function AuditView({ report }: { report: AuditReport }) {
  return (
    <div className="grid gap-3">
      <p className="text-fg">{report.verdict}</p>
      {report.warning ? <p className="text-sm text-ember">{report.warning}</p> : null}
      <p className="text-sm text-muted">
        {report.match ? "原文走通了。" : "原文没有走通。"} 笔是{report.pen}。表面语言是{report.language}。公开话题表对上 {report.publicHits} 句。纪元 {report.epoch}。
        {report.frozen ? " 这份成稿可以交给另一台机器。" : " 这一档没有私稿成稿。"}
      </p>
      <p className="text-sm text-fg">
        {report.coherence.asked
          ? report.coherence.ok === true
            ? "模型认为这版语言是连贯的。"
            : report.coherence.ok === false
              ? "模型认为语言不连贯。"
              : "模型没有审完。"
          : "没接模型，所以没有审语言。接上以后，它只审连贯性，不改字段，也不重写句子。"}
      </p>
      {report.coherence.notes.length ? (
        <ul className="grid gap-1 text-sm text-muted">
          {report.coherence.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      {report.mediaPicks?.length ? (
        <div className="grid gap-2">
          {report.mediaPicks.map((pick) => (
            <p key={pick.id} className="text-sm text-fg">
              <span className="text-sage-ink">{pick.label}</span> {pick.why}
            </p>
          ))}
        </div>
      ) : null}
      {report.mediaBoard?.length ? (
        <div className="grid gap-1">
          {report.mediaBoard.map((row) => (
            <p key={row.id} className="text-sm text-muted">
              {row.label} 完整 {row.completeness} 距离 {row.cipherDistance} 模板 {row.templateRisk} 重复 {row.frameRepeat}
            </p>
          ))}
        </div>
      ) : null}
      {report.fingerprints.length ? (
        <p className="text-sm text-muted">
          {report.fingerprints.map((item) => `${item.voice}/${item.author} ${item.hex}`).join(" · ")}
        </p>
      ) : null}
      {report.dialect === "reel" ? <ReelPlayer frames={report.samples.filter((sample) => sample.dir === "甲").map((sample) => sample.text)} /> : null}
      {report.dialect === "reel" ? null : (
      <div className="grid gap-3">
        {report.samples.map((sample, i) =>
          sample.text.startsWith("<svg xmlns=\"http://www.w3.org/2000/svg\"") && !/script|foreignObject|onload/i.test(sample.text) ? (
            <div key={`${sample.dir}-${i}`} className="overflow-hidden rounded-card bg-paper">
              <div className="svg-card" dangerouslySetInnerHTML={{ __html: sample.text }} />
              <p className="px-3 py-2 text-sm text-sage-ink">{sample.dir}</p>
            </div>
          ) : (
            <p key={`${sample.dir}-${i}`} className="font-serif break-all">
              <span className="text-sage-ink">{sample.dir}</span> {sample.text}
            </p>
          ),
        )}
      </div>
      )}
    </div>
  );
}

function Choice({
  active,
  label,
  note,
  onClick,
}: {
  active: boolean;
  label: string;
  note: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "min-h-11 rounded-card bg-sage px-4 py-2 text-left text-sage-ink"
          : "min-h-11 rounded-card border border-border px-4 py-2 text-left text-fg"
      }
    >
      <span className="block text-sm">{label}</span>
      <span className={active ? "block text-sm text-sage-ink" : "block text-sm text-muted"}>{note}</span>
    </button>
  );
}
