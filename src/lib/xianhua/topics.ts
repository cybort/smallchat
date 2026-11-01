export type Phase = "open" | "memory" | "today" | "bridge";

export type Focus = {
  name: string;
  a: string;
  b: string;
  c: string;
  d: string;
  e: string;
  f: string;
};

export type Topic = {
  id: string;
  label: string;
  /** Noun phrase the previous episode uses when it turns away. */
  hint: string;
  focuses: Focus[];
  openA: string[];
  openB: string[];
  memoryA: string[];
  memoryB: string[];
  todayA: string[];
  todayB: string[];
  bridgeA: string[];
};

export const OPENERS = [
  "说起来，",
  "我跟你讲，",
  "对了，",
  "刚才忽然想到，",
  "跟你说个事，",
  "哦对，",
  "先说这个，",
  "诶，",
  "其实吧，",
  "讲真，",
  "顺便提一句，",
  "我突然想起来，",
  "还有件事，",
  "唔，",
  "你听我说，",
  "先把这句说完，",
];

export const MOODS = [
  "老实讲，",
  "不夸张，",
  "按老习惯，",
  "我寻思，",
  "这么说吧，",
  "细想一下，",
  "随口讲，",
  "认真说，",
  "照实说，",
  "不绕弯，",
  "平平常常，",
  "没怎么酝酿，",
  "大概其，",
  "就是那么回事，",
  "一言蔽之，",
  "不想铺垫，",
];

export const TAILS = [
  "说完我自己先点了点头。",
  "这事我记了很久了。",
  "没想征得谁的同意。",
  "你要是有别的看法也行。",
  "我讲的都是日常。",
  "不拿它当一件新闻。",
  "生活里就这么点波澜。",
  "我习惯把这种事说出来。",
  "不然它会在脑子里转。",
  "讲给谁听其实都一样。",
  "今天愿意多说两句。",
  "语气轻，事情也轻。",
  "我没有要一个结论。",
  "听过就算陪我待了一下。",
  "这句话可以不回。",
  "我接着过我的下午。",
];

export const CONNECTORS = [
  "另外，",
  "还有就是，",
  "补充一句，",
  "接着说，",
  "再补一个细节，",
  "顺带一提，",
  "背后还有，",
  "我再交代一下，",
  "没说完的是，",
  "具体点讲，",
  "展开一下，",
  "底下的情况是，",
  "容易漏掉的是，",
  "我自己在意的是，",
  "人们常忽略的是，",
  "最后补上，",
];

/** Sixteen ways to restate one true fragment, all ending in a comma. */
export const COMMA_FRAMES = [
  (s: string) => `也就是${s}，`,
  (s: string) => `无非是${s}，`,
  (s: string) => `说到底${s}，`,
  (s: string) => `反正${s}，`,
  (s: string) => `我记得是${s}，`,
  (s: string) => `一直都是${s}，`,
  (s: string) => `没别的，就是${s}，`,
  (s: string) => `简单讲是${s}，`,
  (s: string) => `你也知道${s}，`,
  (s: string) => `老样子是${s}，`,
  (s: string) => `还是那样，${s}，`,
  (s: string) => `变来变去还是${s}，`,
  (s: string) => `我能确定${s}，`,
  (s: string) => `不算新鲜，${s}，`,
  (s: string) => `提一嘴，${s}，`,
  (s: string) => `归根是${s}，`,
];

export const PERIOD_FRAMES = [
  (s: string) => `也就是${s}。`,
  (s: string) => `无非是${s}。`,
  (s: string) => `说到底${s}。`,
  (s: string) => `反正${s}。`,
  (s: string) => `我记得是${s}。`,
  (s: string) => `一直都是${s}。`,
  (s: string) => `没别的，就是${s}。`,
  (s: string) => `简单讲是${s}。`,
  (s: string) => `你也知道${s}。`,
  (s: string) => `老样子是${s}。`,
  (s: string) => `还是那样，${s}。`,
  (s: string) => `变来变去还是${s}。`,
  (s: string) => `我能确定${s}。`,
  (s: string) => `不算新鲜，${s}。`,
  (s: string) => `提一嘴，${s}。`,
  (s: string) => `归根是${s}。`,
];

export const BRIDGE_B = [
  "倒是想起{hint}。",
  "我改说{hint}。",
  "下面转到{hint}。",
  "忽然就落到{hint}上。",
];

function focus(
  name: string,
  a: string,
  b: string,
  c: string,
  d: string,
  e: string,
  f: string,
): Focus {
  return { name, a, b, c, d, e, f };
}

export const TOPICS: Topic[] = [
  {
    id: "lunch",
    label: "午饭",
    hint: "午饭",
    focuses: [
      focus("巷口那家面馆", "牛肉面", "同事", "中午要排队", "汤很香", "不算贵", "点牛肉面"),
      focus("公司楼下的盖饭", "鸡腿饭", "同事", "窗口出得快", "酱有点咸", "很便宜", "点鸡腿饭"),
      focus("家附近的寿司店", "三文鱼", "家里人", "位置不多", "饭是温的", "偶尔才舍得", "只点熟的"),
      focus("周末那家火锅", "清汤锅", "朋友", "得先预约", "菜很新鲜", "当一次正经开销", "把辣的让给别人"),
      focus("新开的面包店", "肉松小贝", "自己", "下午才出炉", "甜度刚好", "当点心的价", "买两个就走"),
      focus("菜市场的粥铺", "皮蛋瘦肉粥", "自己", "一早才开张", "粥很绵", "便宜得不用想", "盛一碗就走"),
    ],
    openA: [
      "中午路过{name}，",
      "一到饭点就想起{name}，",
      "刚才在{name}门口停了停，",
      "肚子响的时候想到{name}，",
    ],
    openB: ["里头{c}。", "想吃的是{a}。", "味道上，{d}。", "我一般{f}。"],
    memoryA: ["上次去{name}，", "还记得{name}，", "{name}那回，", "我回想{name}，"],
    memoryB: ["点了{a}，{d}。", "跟平时一样，{c}。", "花费上{e}。", "还是会{f}。"],
    todayA: ["今天若去{name}，", "这顿想着{name}，", "就近的话是{name}，", "懒得找新的，就{name}，"],
    todayB: ["还是会{f}。", "躲不开的是{c}。", "嘴里想的是{a}。", "钱的方面，{e}。"],
    bridgeA: ["{name}先说到这，", "吃饭先不绕{name}了，", "先把{name}放下，", "{name}的事先停，"],
  },
  {
    id: "commute",
    label: "通勤",
    hint: "通勤",
    focuses: [
      focus("地铁二号线", "四十分钟", "自己", "早高峰很挤", "有点闷", "换乘并不省事", "提前一站下车"),
      focus("那班早公交", "半小时", "邻座", "座位要碰运气", "车窗会起雾", "比打车省", "到站就起身"),
      focus("林荫路骑行", "二十分钟", "自己", "红绿灯很密", "风是凉的", "不花钱", "下雨就改乘地铁"),
      focus("过江轮渡", "看一会江的工夫", "看江的人", "班次少", "风大但醒神", "票价便宜", "赶时间就不选它"),
      focus("公司班车", "固定的钟点", "同事", "会等迟到的人", "能补一小会儿觉", "不算进开销", "坐倒数第二排"),
      focus("步行接地铁", "腿要出点力", "自己", "出站后还有一段", "比全程挤着强", "省下一截车费", "换上舒服的鞋再走"),
    ],
    openA: ["今早走的是{name}，", "通勤还是落在{name}，", "我默认的是{name}，", "今天这段是{name}，"],
    openB: ["单程{a}。", "路上{c}。", "体会是{d}。", "习惯上，{f}。"],
    memoryA: ["上次是{name}，", "我记得清楚的是{name}，", "前几天走了{name}，", "印象深的是{name}，"],
    memoryB: ["单程{a}，跟平时一样。", "当时{c}。", "感受仍是{d}。", "还是老习惯，{f}。"],
    todayA: ["今天继续{name}，", "今早还是{name}，", "若是平常的一天，就{name}，", "没有临时变卦的话，{name}，"],
    todayB: ["预计{a}。", "路上大概{c}。", "感觉仍会是{d}。", "习惯上，{f}。"],
    bridgeA: ["{name}先说到这，", "{name}的账先停，", "先不盘{name}，", "不再细说{name}，"],
  },
  {
    id: "weather",
    label: "出门",
    hint: "出门",
    focuses: [
      focus("江边", "一层薄云", "外套", "风从水面来", "适合慢慢走", "不用打伞", "出门前看一眼天"),
      focus("楼下空地", "云有点厚", "薄外套", "地上是干的", "光不刺眼", "鞋不用换", "下楼会站一会"),
      focus("车站那个坡", "风比平地大", "围巾", "上坡要低头", "脸会被吹醒", "不用带伞", "会把帽子压一压"),
      focus("桥面", "江风直来", "扣子", "栏杆是凉的", "视线很开", "站久了会冷", "只走到桥中就回"),
      focus("小区花园", "树荫还在", "便鞋", "长椅有空", "闹中有静", "不需要门票", "绕一圈再回家"),
      focus("街角屋檐", "檐下没雨", "包", "滴水已经停了", "可以躲一会", "不用买伞", "等一等再走"),
    ],
    openA: ["我路过{name}，", "今天经过{name}，", "站到{name}的时候，", "一出门就对着{name}，"],
    openB: ["天上是{a}。", "风的事，{c}。", "我觉得{d}。", "我{f}。"],
    memoryA: ["上次在{name}，", "还记得{name}那天，", "{name}给我留过印象，", "提起{name}，"],
    memoryB: ["天也是{a}。", "同样{c}。", "感觉还是{d}。", "做法还是{f}。"],
    todayA: ["今天的{name}，", "这回的{name}，", "若现在去{name}，", "眼下的{name}，"],
    todayB: ["看起来是{a}。", "仍然{c}。", "所以{d}。", "于是我{f}。"],
    bridgeA: ["{name}先说到这，", "先别站在{name}了，", "{name}的风先放下，", "不继续描述{name}，"],
  },
  {
    id: "reading",
    label: "看书",
    hint: "手里的书",
    focuses: [
      focus("枕边那本小说", "人物不多", "睡前", "看到一半", "句子慢", "不厚", "每天只看几页"),
      focus("包里的随笔", "篇幅短", "通勤", "可以随时合上", "不费眼神", "很轻", "等车时翻两页"),
      focus("图书馆借的那本", "到期日近了", "周末", "还没读完", "注解多", "逾期要算钱", "这周会还"),
      focus("旧书店淘的诗集", "页边有别人的铅笔", "夜里", "挑着读", "空白很多", "花得不多", "读完就搁回架子"),
      focus("桌上的菜谱", "步骤清楚", "晚饭前", "看着就能做", "图比字多", "当工具书", "做完才合上"),
      focus("重读的旧书", "情节还记得", "下午", "专挑折过的页", "像见熟人", "不用再买", "只读喜欢的章"),
    ],
    openA: ["最近在看{name}，", "手里这本是{name}，", "说到书，是{name}，", "眼下读的是{name}，"],
    openB: ["它{a}。", "我多半在{b}看。", "进度是{c}。", "我{f}。"],
    memoryA: ["当初拿起{name}，", "头一回翻{name}，", "记得打开{name}那天，", "{name}刚到我手里时，"],
    memoryB: ["就已经{a}。", "也是{b}看的。", "那时就{c}。", "从一开始就{f}。"],
    todayA: ["今天还会碰{name}，", "这会儿的{name}，", "若有空，就拿{name}，", "睡前仍是{name}，"],
    todayB: ["它还是{a}。", "仍放在{b}。", "眼下{c}。", "所以我{f}。"],
    bridgeA: ["{name}先合上，", "书的事不绕{name}了，", "先把{name}扣下，", "{name}说到这，"],
  },
  {
    id: "cooking",
    label: "晚饭",
    hint: "晚饭",
    focuses: [
      focus("番茄炒蛋", "番茄和蛋", "自己", "糖放得少", "味道稳", "洗一口锅", "五分钟能好"),
      focus("青椒肉丝", "青椒和一碟肉", "自己", "火要大", "咸香", "油会溅一点", "米饭配得下"),
      focus("味噌汤", "豆腐和海带", "家里人", "不能久煮", "热乎就好", "几乎不油", "先喝再吃饭"),
      focus("煎饺", "白菜猪肉馅", "朋友", "锅要热", "底要脆", "油比炒菜多", "蘸醋吃"),
      focus("蔬菜面", "一把青菜", "自己", "汤单独烧", "清淡", "比外卖便宜", "卧一个蛋"),
      focus("蒸蛋", "两只蛋", "自己", "盖子留一条缝", "嫩就行", "洗碗最省事", "撒一点葱"),
    ],
    openA: ["晚饭做{name}，", "今晚想的是{name}，", "厨房里准备的是{name}，", "这顿就定{name}，"],
    openB: ["用的是{a}。", "吃的人是{b}。", "做法上，{c}。", "习惯是{f}。"],
    memoryA: ["上次做{name}，", "还是那道{name}，", "熟练的是{name}，", "回头说{name}，"],
    memoryB: ["材料也是{a}。", "当时给{b}吃。", "同样{c}。", "结尾我{f}。"],
    todayA: ["今天的{name}，", "这顿的{name}，", "若就做{name}，", "不换了，{name}，"],
    todayB: ["材料还是{a}。", "上桌给{b}。", "关键仍是{c}。", "出锅前我{f}。"],
    bridgeA: ["{name}先说到这，", "厨房先别围着{name}，", "先把{name}端走，", "{name}的烟先散，"],
  },
  {
    id: "weekend",
    label: "周末",
    hint: "周末",
    focuses: [
      focus("下午的长走", "江边来回", "自己", "不安排第二件事", "腿酸得刚好", "只花时间", "周日晚上就收"),
      focus("博物馆的半天", "一个展厅", "朋友", "不贪多", "看完会饿", "门票还行", "出来找家馆子"),
      focus("在家修东西", "松了的柜门", "自己", "工具就那几样", "弄完很安静", "不用叫人", "下午三点前停手"),
      focus("早市逛一圈", "两条街", "家里人", "去早才有好的", "包会变重", "比超市便宜", "九点前离开"),
      focus("看电影的一场", "后排靠过道", "朋友", "不选太晚的场", "散场外面已经暗了", "爆米花可有可无", "看完直接回家"),
      focus("什么都不约", "家里", "自己", "手机放远一点", "难得不看钟", "最省", "晚上再出门吃饭"),
    ],
    openA: ["周末多半是{name}，", "我把周末留给{name}，", "说到休息，就是{name}，", "空下来会去做{name}，"],
    openB: ["范围是{a}。", "一起的是{b}。", "分寸是{c}。", "我{f}。"],
    memoryA: ["上次的{name}，", "还记得那回{name}，", "{name}做过不止一次，", "提起{name}，"],
    memoryB: ["也就是{a}。", "同伴是{b}。", "一样{c}。", "结束时{f}。"],
    todayA: ["这个周末若是{name}，", "眼下倾向{name}，", "不另找节目的话，{name}，", "就按老样子，{name}，"],
    todayB: ["还是{a}。", "人还是{b}。", "依旧{c}。", "到点我就{f}。"],
    bridgeA: ["{name}先说到这，", "周末的事先离开{name}，", "先不排{name}了，", "{name}先搁下，"],
  },
  {
    id: "sleep",
    label: "睡觉",
    hint: "睡觉",
    focuses: [
      focus("夜里那段睡眠", "十二点前躺下", "手机", "容易半夜醒", "房间黑一点好", "晚上不喝茶", "醒了就不看屏幕"),
      focus("午后的小睡", "二十分钟", "闹钟", "超过就头疼", "沙发就行", "不盖太厚", "醒来喝一口水"),
      focus("出差时的床", "陌生枕头", "耳塞", "第一夜会浅", "窗帘要夹严", "不喝迷你吧", "先洗热水再躺"),
      focus("周末的懒觉", "自然醒", "窗帘", "不设闹钟", "阳光进来就够了", "误不了什么", "醒了先发呆"),
      focus("熬过后的补觉", "第二天上午", "安静", "做梦很碎", "补不回全部", "咖啡先停", "中午前一定起来"),
      focus("雨夜的睡眠", "雨声", "窗户", "睡得比平时沉", "被角要暖", "不用白噪音", "窗留一条缝"),
    ],
    openA: ["说到睡，是{name}，", "我在意的是{name}，", "真正算数的是{name}，", "这阵子依赖{name}，"],
    openB: ["时间上，{a}。", "旁边是{b}。", "麻烦在于{c}。", "所以我{f}。"],
    memoryA: ["以前的{name}，", "记得{name}那种时候，", "{name}一直如此，", "回头看{name}，"],
    memoryB: ["也同样{a}。", "离不了{b}。", "还是{c}。", "我早已{f}。"],
    todayA: ["今晚的{name}，", "接下来的{name}，", "若一切平常，{name}，", "我准备好的是{name}，"],
    todayB: ["仍想{a}。", "还是把{b}放在手边。", "防的就是{c}。", "因此我{f}。"],
    bridgeA: ["{name}先说到这，", "睡的事先别扯{name}，", "先把{name}放下，", "{name}先告一段落，"],
  },
  {
    id: "neighborhood",
    label: "楼下",
    hint: "楼下",
    focuses: [
      focus("楼下便利店", "夜班店员", "晚上", "灯很亮", "东西算齐", "略贵", "忘了买就下去一趟"),
      focus("街角菜摊", "固定的摊主", "傍晚", "收得早", "菜是当天的", "可以讲价", "路过就看一眼叶子"),
      focus("巷口修车的", "老师傅", "下午", "不接太复杂的活", "手脚慢但稳", "价格先说死", "链条响了才去"),
      focus("小区门岗", "夜班的师傅", "夜里", "会多看一眼", "话不多", "不算麻烦", "晚归会点一下头"),
      focus("对面理发店", "老板自己剪", "周末", "不用预约", "剪得保守", "不推销", "两个月才去一次"),
      focus("转角面包店", "清晨出炉", "早上", "八点后就少了", "咸的比甜的好", "当早餐刚好", "只买一个就走"),
    ],
    openA: ["楼下绕不开{name}，", "我常去的是{name}，", "出了门就是{name}，", "这条街上有{name}，"],
    openB: ["那儿的人是{a}。", "我一般{b}去。", "规矩是{c}。", "我{f}。"],
    memoryA: ["认识{name}很久了，", "头一回去{name}，", "{name}一直在，", "说起{name}，"],
    memoryB: ["见面的就是{a}。", "也是{b}去的。", "当初就{c}。", "我从那时起就{f}。"],
    todayA: ["今天也许去{name}，", "若要补点东西，{name}，", "顺路会进{name}，", "还是{name}最省事，"],
    todayB: ["还是找{a}。", "时间仍是{b}。", "他们依旧{c}。", "所以我{f}。"],
    bridgeA: ["{name}先说到这，", "楼下的事先离开{name}，", "先不进{name}了，", "{name}的门先带上，"],
  },
  {
    id: "workday",
    label: "白天",
    hint: "白天的杂事",
    focuses: [
      focus("上午那段会", "半小时", "同事", "不算长", "该说的能说完", "不把工作带回家", "四点后效率就差"),
      focus("午后的文档", "一份纪要", "自己", "改两遍就停", "句子要短", "不追求漂亮", "下班前发出去"),
      focus("排队等的答复", "一封邮件", "对方", "催一次就好", "不干等", "先做别的", "到点再看收件箱"),
      focus("桌面的整理", "一摞纸", "自己", "只留这周的", "清完能喘气", "不买新文件夹", "周五下午做"),
      focus("跟同事对的进度", "三件事", "同组的人", "站着说完", "不展开闲篇", "十分钟够了", "说完就回座位"),
      focus("自己的那份清单", "五项", "自己", "做完就划掉", "不临时加塞", "留一项给明天", "中午前看一次"),
    ],
    openA: ["白天躲不开{name}，", "今天工作里有{name}，", "桌上摆着的是{name}，", "我会先处理{name}，"],
    openB: ["分量是{a}。", "对面是{b}。", "分寸是{c}。", "我{f}。"],
    memoryA: ["以前的{name}，", "做过很多次{name}，", "{name}并不新鲜，", "回想{name}，"],
    memoryB: ["也就是{a}。", "一起的是{b}。", "一向{c}。", "我习惯{f}。"],
    todayA: ["今天的{name}，", "这回的{name}，", "若按计划，{name}，", "先了结{name}，"],
    todayB: ["还是{a}。", "人还是{b}。", "依旧{c}。", "做的时候我{f}。"],
    bridgeA: ["{name}先说到这，", "工作的事先放下{name}，", "先不谈{name}，", "{name}先划掉，"],
  },
];

const TOPIC_BY_ID = new Map(TOPICS.map((t) => [t.id, t]));

export function topicById(id: string): Topic {
  const t = TOPIC_BY_ID.get(id);
  if (!t) throw new Error(`unknown topic ${id}`);
  return t;
}

export function fill(tpl: string, f: Focus, hint: string): string {
  return tpl
    .replaceAll("{name}", f.name)
    .replaceAll("{a}", f.a)
    .replaceAll("{b}", f.b)
    .replaceAll("{c}", f.c)
    .replaceAll("{d}", f.d)
    .replaceAll("{e}", f.e)
    .replaceAll("{f}", f.f)
    .replaceAll("{hint}", hint);
}

export function phaseBanks(topic: Topic, phase: Phase): { a: string[]; b: string[] } {
  if (phase === "open") return { a: topic.openA, b: topic.openB };
  if (phase === "memory") return { a: topic.memoryA, b: topic.memoryB };
  if (phase === "today") return { a: topic.todayA, b: topic.todayB };
  return { a: topic.bridgeA, b: BRIDGE_B };
}

export type SlotLists = {
  opener: string[];
  mood: string[];
  a: string[];
  b: string[];
  tail: string[];
  conn: string[];
  ea: string[];
  eb: string[];
  ec: string[];
};

const SLOT_BITS: Record<keyof SlotLists, number> = {
  opener: 4,
  mood: 4,
  a: 2,
  b: 2,
  tail: 4,
  conn: 4,
  ea: 4,
  eb: 4,
  ec: 4,
};

const checkedSlots = new Set<string>();

function assertSlots(key: string, lists: SlotLists): void {
  if (checkedSlots.has(key)) return;
  for (const name of Object.keys(SLOT_BITS) as (keyof SlotLists)[]) {
    const list = lists[name];
    const want = 2 ** SLOT_BITS[name];
    if (list.length !== want) {
      throw new Error(`${key} ${name} has ${list.length}, want ${want}`);
    }
    for (let i = 0; i < list.length; i++) {
      if (!list[i]) throw new Error(`${key} ${name} empty`);
      for (let j = 0; j < list.length; j++) {
        if (i !== j && (list[i] === list[j] || list[j].startsWith(list[i]))) {
          throw new Error(`${key} ${name} overlaps: ${list[i]} ‖ ${list[j]}`);
        }
      }
    }
  }
  checkedSlots.add(key);
}

export function slotLists(topic: Topic, focus: Focus, phase: Phase, hint: string): SlotLists {
  const bank = phaseBanks(topic, phase);
  const lists: SlotLists = {
    opener: OPENERS,
    mood: MOODS,
    a: bank.a.map((s) => fill(s, focus, hint)),
    b: bank.b.map((s) => fill(s, focus, hint)),
    tail: TAILS,
    conn: CONNECTORS,
    ea: COMMA_FRAMES.map((fn) => fn(focus.c)),
    eb: COMMA_FRAMES.map((fn) => fn(focus.d)),
    ec: PERIOD_FRAMES.map((fn) => fn(focus.e)),
  };
  assertSlots(`${topic.id}:${focus.name}:${phase}:${hint}`, lists);
  return lists;
}
