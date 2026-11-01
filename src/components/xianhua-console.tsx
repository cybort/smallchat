import { useEffect, useState } from "react";
import { VeilPanel } from "@/components/xianhua-veil";
import { publicIdentity, type Identity, type PublicIdentity } from "@/lib/xianhua/crypto";
import {
  DEFAULT_SETTINGS,
  connectCommand,
  freshIdentity,
  leaveFile,
  publicFile,
  renameIdentity,
  serveCommand,
  settingsOk,
  stayFile,
  type DeploySettings,
} from "@/lib/xianhua/deploy";
import { runDemo, type DemoResult } from "@/lib/xianhua/demo";
import { proveSockets } from "@/lib/xianhua/prove";
import type { TcpProof } from "@/lib/xianhua/prove";
import type { Profile } from "@/lib/xianhua/wire";

const DEFAULT_PAYLOAD = "今天下午把窗口的草稿寄出，对方只需要看到一封平常的信。";

type Pair = { mine: Identity; peer: PublicIdentity; other: Identity; minePub: PublicIdentity };

function num(n: number, digits: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function verdictOf(result: DemoResult): string {
  const gzip = result.wire.gzipRatio < 0.75 && result.cipher.gzipRatio > 0.85;
  const ent = result.wire.shannon + 0.3 < result.cipher.shannon;
  const chi = result.wire.chiSquare > result.cipher.chiSquare;
  if (gzip && ent && chi) {
    return "熵、相关、卡方和压缩率都落在闲聊一侧。抽样读的时候，一段里事实不变，只是换了说法。";
  }
  return "有一项贴得太近。对话档通常比稠密档离密文更远；稠密档换来的是体积。";
}

export function Console() {
  const [profile, setProfile] = useState<Profile>("talk");
  const [payload, setPayload] = useState(DEFAULT_PAYLOAD);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [socket, setSocket] = useState<TcpProof | null>(null);
  const [socketBusy, setSocketBusy] = useState(false);
  const [socketError, setSocketError] = useState("");
  const [controlPort, setControlPort] = useState(String(DEFAULT_SETTINGS.controlPort));
  const [dataPort, setDataPort] = useState(String(DEFAULT_SETTINGS.dataPort));
  const [socksPort, setSocksPort] = useState(String(DEFAULT_SETTINGS.socksPort));
  const [httpPort, setHttpPort] = useState(String(DEFAULT_SETTINGS.httpPort));
  const [mapPort, setMapPort] = useState(String(DEFAULT_SETTINGS.mapListen));
  const [mapHost, setMapHost] = useState(DEFAULT_SETTINGS.mapHost);
  const [mapRemote, setMapRemote] = useState(String(DEFAULT_SETTINGS.mapPort));
  const [host, setHost] = useState(DEFAULT_SETTINGS.host);
  const [pair, setPair] = useState<Pair | null>(null);
  const [showPriv, setShowPriv] = useState(false);

  async function walk(nextProfile = profile, nextPayload = payload) {
    setBusy(true);
    setError("");
    try {
      const demo = await runDemo(nextProfile, nextPayload);
      setResult(demo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "没走通");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancel = false;
    runDemo("talk", DEFAULT_PAYLOAD)
      .then((demo) => {
        if (!cancel) setResult(demo);
      })
      .catch((err: unknown) => {
        if (!cancel) setError(err instanceof Error ? err.message : "没走通");
      });
    const mine = freshIdentity("甲");
    const other = freshIdentity("乙");
    setPair({ mine, other, peer: publicIdentity(other), minePub: publicIdentity(mine) });
    return () => {
      cancel = true;
    };
  }, []);

  async function walkSockets() {
    setSocketBusy(true);
    setSocketError("");
    try {
      const proof = await proveSockets({ data: { profile, payload: payload.slice(0, 180) } });
      setSocket(proof);
    } catch (err) {
      setSocketError(err instanceof Error ? err.message : "套接字没走通");
    } finally {
      setSocketBusy(false);
    }
  }

  function settings(): DeploySettings {
    return {
      host,
      bind: DEFAULT_SETTINGS.bind,
      controlPort: Number(controlPort),
      dataPort: Number(dataPort),
      socksPort: Number(socksPort),
      httpPort: Number(httpPort),
      mapListen: Number(mapPort),
      mapHost,
      mapPort: Number(mapRemote),
      profile,
    };
  }

  function regen(which: "stay" | "leave" | "both") {
    setPair((current) => {
      if (!current) return current;
      const next = { ...current };
      if (which !== "leave") {
        next.mine = freshIdentity(current.mine.name);
        next.minePub = publicIdentity(next.mine);
      }
      if (which !== "stay") {
        next.other = freshIdentity(current.other.name);
        next.peer = publicIdentity(next.other);
      }
      return next;
    });
  }

  function rename(which: "stay" | "leave", name: string) {
    setPair((current) => {
      if (!current) return current;
      if (which === "stay") {
        const mine = renameIdentity(current.mine, name);
        return { ...current, mine, minePub: publicIdentity(mine) };
      }
      const other = renameIdentity(current.other, name);
      return { ...current, other, peer: publicIdentity(other) };
    });
  }

  function save(filename: string, data: unknown) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetSettings() {
    setHost(DEFAULT_SETTINGS.host);
    setControlPort(String(DEFAULT_SETTINGS.controlPort));
    setDataPort(String(DEFAULT_SETTINGS.dataPort));
    setSocksPort(String(DEFAULT_SETTINGS.socksPort));
    setHttpPort(String(DEFAULT_SETTINGS.httpPort));
    setMapPort(String(DEFAULT_SETTINGS.mapListen));
    setMapHost(DEFAULT_SETTINGS.mapHost);
    setMapRemote(String(DEFAULT_SETTINGS.mapPort));
    setProfile(DEFAULT_SETTINGS.profile);
  }

  const setup = settings();
  const setupError = settingsOk(setup);
  const dataLines = result?.data.filter((line) => line.from === "client").slice(0, 18) ?? [];
  const controlLines = result?.control.filter((line) => line.from === "client").slice(0, 3) ?? [];

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6">
      <header className="max-w-2xl">
        <p className="text-sm text-sage">闲话</p>
        <h1 className="mt-2 text-3xl text-fg">两台机器之间，线上只看见闲聊</h1>
        <p className="mt-3 text-muted">
          控制口先用长期公钥做一次握手，数据口再用会话密钥走流量。两口分开，都可以改。外面做统计，看到的是汉字和压缩率；偶尔抽一段来读，话题是连贯的，不会同一句翻来覆去。
        </p>
      </header>

      <section className="mt-8 grid gap-4 rounded-card border border-border bg-surface p-4">
        <div className="flex flex-wrap gap-2">
          <ProfileButton active={profile === "talk"} onClick={() => setProfile("talk")} label="对话档" note="更像人说话，体积大" />
          <ProfileButton active={profile === "dense"} onClick={() => setProfile("dense")} label="稠密档" note="同一套事实，多补几句" />
        </div>
        <label className="grid gap-2 text-sm text-muted">
          要送过去的原文
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            rows={3}
            className="w-full resize-y rounded-card border border-border bg-bg px-3 py-3 text-base text-fg"
          />
        </label>
        <button
          type="button"
          onClick={() => void walk()}
          disabled={busy || payload.trim().length === 0}
          className="h-11 rounded-card bg-sage px-4 text-sage-ink disabled:opacity-50"
        >
          {busy ? "正在走…" : "走一遍"}
        </button>
        {error ? <p className="text-sm text-ember">{error}</p> : null}
      </section>

      {result ? <Report result={result} dataLines={dataLines} controlLines={controlLines} /> : <p className="mt-8 text-muted">正在把默认的那封信走完。</p>}

      <section className="mt-10 grid gap-4 rounded-card border border-border bg-surface p-4">
        <div>
          <h2 className="text-xl text-fg">真实的两口套接字</h2>
          <p className="mt-2 text-sm text-muted">
            这一步会真的听两个不同的口，再用 SOCKS、HTTP CONNECT 和一条固定映射把原文送回去。预览里口是临时的；下面的数字是你分到两台机器上时用的。
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="控制口" value={controlPort} onChange={setControlPort} />
          <Field label="数据口" value={dataPort} onChange={setDataPort} />
          <Field label="本地代理" value={socksPort} onChange={setSocksPort} />
          <Field label="HTTP 口" value={httpPort} onChange={setHttpPort} />
          <Field label="固定映射" value={mapPort} onChange={setMapPort} />
          <TextField label="映射到的地址" value={mapHost} onChange={setMapHost} />
          <Field label="映射到的口" value={mapRemote} onChange={setMapRemote} />
          <TextField label="对端地址" value={host} onChange={setHost} />
        </div>
        {setupError ? <p className="text-sm text-ember">{setupError}</p> : null}
        <button
          type="button"
          onClick={() => void walkSockets()}
          disabled={socketBusy}
          className="h-11 rounded-card border border-sage px-4 text-sage disabled:opacity-50"
        >
          {socketBusy ? "套接字进行中…" : "用套接字再走一遍"}
        </button>
        {socketError ? <p className="text-sm text-ember">{socketError}</p> : null}
        {socket ? (
          <div className="grid gap-2 text-sm">
            <p className={socket.match ? "text-sage" : "text-ember"}>
              {socket.match ? "原文从代理和映射两端都原样回来了。" : "有一路没有原样回来。"}
              {socket.differentPorts ? ` 控制口 ${socket.controlPort}，数据口 ${socket.dataPort}。` : ""}
            </p>
            <p className="text-muted">
              线上压缩比 {num(socket.wire.gzipRatio, 2)}，同长度密文 {num(socket.cipher.gzipRatio, 2)}。汉字占比 {num(socket.wire.cjkRatio * 100, 0)}%。
            </p>
            <div className="rounded-card bg-paper p-4 text-ink">
              {socket.sample.map((line, i) => (
                <p key={`${i}-${line.slice(0, 12)}`} className="mt-2 font-serif first:mt-0">
                  {line}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <VeilPanel />

      <section className="mt-10 grid gap-4 lg:grid-cols-2">
        <KeyCard
          title="留下的那一端"
          note={`监听控制口 ${controlPort || "—"} 和数据口 ${dataPort || "—"}。私钥只留在这台机器。重新生成后，旧公钥作废，把新公钥交给出去的那一端。`}
          identity={pair?.mine ?? null}
          pub={pair?.minePub ?? null}
          showPriv={showPriv}
          onRename={(name) => rename("stay", name)}
          onRegen={() => regen("stay")}
          onSecret={() => pair && save(`${pair.mine.name.trim() || "甲"}.json`, { ...pair.mine, name: pair.mine.name.trim() || "甲" })}
          onPub={() => pair && save(`${pair.mine.name.trim() || "甲"}.json.pub`, publicFile({ ...pair.mine, name: pair.mine.name.trim() || "甲" }))}
          onConfig={() =>
            pair &&
            !setupError &&
            save(`${pair.mine.name.trim() || "甲"}.host.json`, stayFile({ ...pair.mine, name: pair.mine.name.trim() || "甲" }, pair.peer, setup))
          }
          configDisabled={Boolean(setupError)}
        />
        <KeyCard
          title="出去的那一端"
          note={`连到 ${host || "—"} 的两个口。本地 ${socksPort || "—"} 给会设代理的程序，${mapPort || "—"} 映射到 ${mapHost || "—"}:${mapRemote || "—"}。`}
          identity={pair?.other ?? null}
          pub={pair?.peer ?? null}
          showPriv={showPriv}
          onRename={(name) => rename("leave", name)}
          onRegen={() => regen("leave")}
          onSecret={() => pair && save(`${pair.other.name.trim() || "乙"}.json`, { ...pair.other, name: pair.other.name.trim() || "乙" })}
          onPub={() => pair && save(`${pair.other.name.trim() || "乙"}.json.pub`, publicFile({ ...pair.other, name: pair.other.name.trim() || "乙" }))}
          onConfig={() =>
            pair &&
            !setupError &&
            save(`${pair.other.name.trim() || "乙"}.host.json`, leaveFile({ ...pair.other, name: pair.other.name.trim() || "乙" }, pair.minePub, setup))
          }
          configDisabled={Boolean(setupError)}
        />
      </section>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => regen("stay")} className="h-11 rounded-card border border-border px-4 text-sm text-fg">
          重新生成留下的密钥
        </button>
        <button type="button" onClick={() => regen("leave")} className="h-11 rounded-card border border-border px-4 text-sm text-fg">
          重新生成出去的密钥
        </button>
        <button
          type="button"
          onClick={() => regen("both")}
          className="h-11 rounded-card border border-border px-4 text-sm text-fg"
        >
          两边都换
        </button>
        <button type="button" onClick={() => setShowPriv((v) => !v)} className="h-11 rounded-card border border-border px-4 text-sm text-fg">
          {showPriv ? "收起私钥" : "显示私钥"}
        </button>
        <button type="button" onClick={resetSettings} className="h-11 rounded-card border border-sage px-4 text-sm text-sage">
          配置恢复默认
        </button>
      </div>
      {pair && !setupError ? (
        <div className="mt-4 grid gap-2 text-sm text-muted">
          <p className="break-all">{serveCommand(setup, `${pair.mine.name}.json`, `${pair.other.name}.json.pub`)}</p>
          <p className="break-all">{connectCommand(setup, `${pair.other.name}.json`, `${pair.mine.name}.json.pub`)}</p>
        </div>
      ) : null}

      <p className="mt-8 max-w-2xl text-sm text-muted">
        换题间隔由会话密钥决定，两边相同，看起来不规则。没有私稿时，拿到程序的人能认出公开话题表。带上成稿以后，程序里的那张表对不上线上的句子；成稿本身不走这两口，换纪元就换一版。
      </p>
      <p className="mt-3 text-sm">
        <a className="text-sage underline" href="/xianhua-peer.zip">
          下载两端用的程序
        </a>
      </p>
    </main>
  );
}

function ProfileButton({
  active,
  onClick,
  label,
  note,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  note: string;
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

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="grid min-w-0 gap-1 text-sm text-muted">
      {label}
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
        className="h-11 w-full min-w-0 rounded-card border border-border bg-bg px-3 text-base text-fg"
      />
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="grid min-w-0 gap-1 text-sm text-muted">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 80))}
        className="h-11 w-full min-w-0 rounded-card border border-border bg-bg px-3 text-base text-fg"
      />
    </label>
  );
}

function KeyCard({
  title,
  note,
  identity,
  pub,
  showPriv,
  onRename,
  onRegen,
  onSecret,
  onPub,
  onConfig,
  configDisabled,
}: {
  title: string;
  note: string;
  identity: Identity | null;
  pub: PublicIdentity | null;
  showPriv: boolean;
  onRename: (name: string) => void;
  onRegen: () => void;
  onSecret: () => void;
  onPub: () => void;
  onConfig: () => void;
  configDisabled: boolean;
}) {
  return (
    <article className="rounded-card border border-border bg-surface p-4">
      <h2 className="text-xl">{title}</h2>
      <p className="mt-2 text-sm text-muted">{note}</p>
      {identity && pub ? (
        <div className="mt-4 grid gap-3">
          <TextField label="名字" value={identity.name} onChange={onRename} />
          <KeyBlock title="公钥" value={JSON.stringify(pub)} />
          {showPriv ? <KeyBlock title="私钥，只放在这一端" value={JSON.stringify(identity)} /> : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onRegen} className="h-11 rounded-card bg-sage px-4 text-sm text-sage-ink">
              重新生成
            </button>
            <button type="button" onClick={onSecret} className="h-11 rounded-card border border-border px-4 text-sm text-fg">
              下载私钥
            </button>
            <button type="button" onClick={onPub} className="h-11 rounded-card border border-border px-4 text-sm text-fg">
              下载公钥
            </button>
            <button type="button" onClick={onConfig} disabled={configDisabled} className="h-11 rounded-card border border-border px-4 text-sm text-fg disabled:opacity-50">
              下载配置
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">正在生成密钥。</p>
      )}
    </article>
  );
}

function KeyBlock({ title, value }: { title: string; value: string }) {
  return (
    <label className="mt-4 grid gap-1 text-sm text-muted">
      {title}
      <textarea readOnly rows={3} value={value} className="w-full resize-none rounded-card border border-border bg-bg px-3 py-2 font-serif text-sm text-fg" />
    </label>
  );
}

function Report({
  result,
  dataLines,
  controlLines,
}: {
  result: DemoResult;
  dataLines: DemoResult["data"];
  controlLines: DemoResult["control"];
}) {
  const rows = [
    ["熵", num(result.wire.shannon, 2), num(result.cipher.shannon, 2)],
    ["相邻相关", num(result.wire.serial, 3), num(result.cipher.serial, 3)],
    ["卡方", num(result.wire.chiSquare, 0), num(result.cipher.chiSquare, 0)],
    ["压缩比", num(result.wire.gzipRatio, 2), num(result.cipher.gzipRatio, 2)],
    ["汉字占比", `${num(result.wire.cjkRatio * 100, 0)}%`, "—"],
  ];
  return (
    <section className="mt-8 grid gap-4">
      <p className="text-fg">{verdictOf(result)}</p>
      <p className="text-sm text-muted">
        {result.match ? "对端收回的原文一致。" : "对端收回的原文不一致。"} 体积大约 {num(result.expansion, 1)} 倍。重复句 {result.duplicateLines}。换题间隔{" "}
        {result.episodeLengths.join("、")}。
      </p>
      <div className="overflow-hidden rounded-card border border-border">
        <div className="grid grid-cols-3 bg-surface-2 px-3 py-2 text-sm text-muted">
          <span>统计</span>
          <span>线上</span>
          <span>内层密文</span>
        </div>
        {rows.map((row) => (
          <div key={row[0]} className="grid grid-cols-3 border-t border-border px-3 py-2 text-sm">
            <span className="text-muted">{row[0]}</span>
            <span>{row[1]}</span>
            <span className="text-ember">{row[2]}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {result.topics.map((topic, i) => (
          <span key={`${topic}-${i}`} className="rounded-card bg-surface-2 px-3 py-2 text-sm text-sage">
            {topic}
            <span className="text-muted"> {result.episodeLengths[i] ?? ""}</span>
          </span>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-card bg-paper p-4 text-ink">
          <h2 className="text-sm text-sage-ink">数据口</h2>
          {dataLines.map((line, i) => (
            <div key={`${line.text}-${i}`} className="mt-3">
              {i === 0 || line.label !== dataLines[i - 1]?.label ? (
                <p className="text-sm text-sage-ink">
                  {line.label} · {line.focus}
                  <span className="block text-ink">{line.fact}</span>
                </p>
              ) : null}
              <p className="mt-1 font-serif">{line.text}</p>
            </div>
          ))}
        </article>
        <div className="grid gap-4">
          <article className="rounded-card bg-paper p-4 text-ink">
            <h2 className="text-sm text-sage-ink">控制口开头</h2>
            {controlLines.map((line, i) => (
              <p key={`c-${i}`} className="mt-3 font-serif">
                {line.text}
              </p>
            ))}
          </article>
          <article className="rounded-card border border-border p-4">
            <h2 className="text-sm text-muted">抽样三段</h2>
            {result.samples.map((sample) => (
              <div key={`${sample.label}-${sample.focus}`} className="mt-3">
                <p className="text-sm text-sage">
                  {sample.label} · {sample.focus}
                </p>
                {sample.lines.map((line, i) => (
                  <p key={`${sample.label}-${i}`} className="mt-1 text-sm text-fg">
                    {line}
                  </p>
                ))}
              </div>
            ))}
          </article>
        </div>
      </div>
    </section>
  );
}
