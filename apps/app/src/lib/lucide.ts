/**
 * Os ícones do app, um por um (D-062 item 5, `docs/19`). O Metro troca `import ... from 'lucide-react-native'` por este arquivo
 * (`metro.config.js`): importar o pacote inteiro põe os 1.867 ícones no pacote web (2,1 MB a mais, antes de comprimir) e só
 * 98 são usados. Ícone novo: acrescente a linha aqui (o nome de `lucide-react-native` e o arquivo em kebab-case); o teste
 * `packages/core/test/lucide-barrel.test.ts` falha se uma tela importa um ícone que não está aqui. O TypeScript também lê este arquivo no lugar do
 * pacote (`paths` em `apps/app/tsconfig.json`): ícone que não está aqui é erro de tipo em `npm run typecheck`.
 */

import type Icon from 'lucide-react-native/icons/check';

/** O tipo de um ícone (`LucideIcon` do pacote, o mesmo para todos eles): as telas o importam daqui, como importam os ícones. */
export type LucideIcon = typeof Icon;

export { default as AlertCircle } from 'lucide-react-native/icons/circle-alert';
export { default as AppWindow } from 'lucide-react-native/icons/app-window';
export { default as Archive } from 'lucide-react-native/icons/archive';
export { default as ArchiveRestore } from 'lucide-react-native/icons/archive-restore';
export { default as ArrowDownLeft } from 'lucide-react-native/icons/arrow-down-left';
export { default as ArrowLeft } from 'lucide-react-native/icons/arrow-left';
export { default as ArrowLeftRight } from 'lucide-react-native/icons/arrow-left-right';
export { default as ArrowRight } from 'lucide-react-native/icons/arrow-right';
export { default as ArrowUpRight } from 'lucide-react-native/icons/arrow-up-right';
export { default as BadgePercent } from 'lucide-react-native/icons/badge-percent';
export { default as Ban } from 'lucide-react-native/icons/ban';
export { default as Bell } from 'lucide-react-native/icons/bell';
export { default as BellOff } from 'lucide-react-native/icons/bell-off';
export { default as BookOpen } from 'lucide-react-native/icons/book-open';
export { default as BookOpenCheck } from 'lucide-react-native/icons/book-open-check';
export { default as Building2 } from 'lucide-react-native/icons/building-complex';
export { default as Calculator } from 'lucide-react-native/icons/calculator';
export { default as CalendarClock } from 'lucide-react-native/icons/calendar-clock';
export { default as CalendarDays } from 'lucide-react-native/icons/calendar-days';
export { default as CalendarOff } from 'lucide-react-native/icons/calendar-off';
export { default as CalendarRange } from 'lucide-react-native/icons/calendar-range';
export { default as CalendarSync } from 'lucide-react-native/icons/calendar-sync';
export { default as CalendarX } from 'lucide-react-native/icons/calendar-x';
export { default as CalendarX2 } from 'lucide-react-native/icons/calendar-x-2';
export { default as ChartLine } from 'lucide-react-native/icons/chart-line';
export { default as ChartPie } from 'lucide-react-native/icons/chart-pie';
export { default as Check } from 'lucide-react-native/icons/check';
export { default as CheckCircle2 } from 'lucide-react-native/icons/circle-check';
export { default as ChevronDown } from 'lucide-react-native/icons/chevron-down';
export { default as ChevronLeft } from 'lucide-react-native/icons/chevron-left';
export { default as ChevronRight } from 'lucide-react-native/icons/chevron-right';
export { default as ChevronUp } from 'lucide-react-native/icons/chevron-up';
export { default as CircleAlert } from 'lucide-react-native/icons/circle-alert';
export { default as CircleCheck } from 'lucide-react-native/icons/circle-check';
export { default as CircleMinus } from 'lucide-react-native/icons/circle-minus';
export { default as CircleOff } from 'lucide-react-native/icons/circle-off';
export { default as CirclePlay } from 'lucide-react-native/icons/circle-play';
export { default as CircleQuestionMark } from 'lucide-react-native/icons/circle-question-mark';
export { default as ClipboardCheck } from 'lucide-react-native/icons/clipboard-check';
export { default as Coins } from 'lucide-react-native/icons/coins';
export { default as Compass } from 'lucide-react-native/icons/compass';
export { default as Copy } from 'lucide-react-native/icons/copy';
export { default as CreditCard } from 'lucide-react-native/icons/credit-card';
export { default as Download } from 'lucide-react-native/icons/download';
export { default as Ellipsis } from 'lucide-react-native/icons/ellipsis';
export { default as ExternalLink } from 'lucide-react-native/icons/external-link';
export { default as Eye } from 'lucide-react-native/icons/eye';
export { default as EyeOff } from 'lucide-react-native/icons/eye-off';
export { default as FileDown } from 'lucide-react-native/icons/file-down';
export { default as FileText } from 'lucide-react-native/icons/file-text';
export { default as FileUp } from 'lucide-react-native/icons/file-up';
export { default as Flag } from 'lucide-react-native/icons/flag';
export { default as Flashlight } from 'lucide-react-native/icons/flashlight';
export { default as FlashlightOff } from 'lucide-react-native/icons/flashlight-off';
export { default as Gauge } from 'lucide-react-native/icons/gauge';
export { default as HandCoins } from 'lucide-react-native/icons/hand-coins';
export { default as Hourglass } from 'lucide-react-native/icons/hourglass';
export { default as House } from 'lucide-react-native/icons/house';
export { default as Info } from 'lucide-react-native/icons/info';
export { default as KeyRound } from 'lucide-react-native/icons/key-round';
export { default as Landmark } from 'lucide-react-native/icons/landmark';
export { default as Layers } from 'lucide-react-native/icons/layers';
export { default as ListChecks } from 'lucide-react-native/icons/list-checks';
export { default as ListOrdered } from 'lucide-react-native/icons/list-ordered';
export { default as LockKeyhole } from 'lucide-react-native/icons/lock-keyhole';
export { default as LogOut } from 'lucide-react-native/icons/log-out';
export { default as Mail } from 'lucide-react-native/icons/mail';
export { default as MailCheck } from 'lucide-react-native/icons/mail-check';
export { default as Minus } from 'lucide-react-native/icons/minus';
export { default as MonitorSmartphone } from 'lucide-react-native/icons/monitor-smartphone';
export { default as NotebookPen } from 'lucide-react-native/icons/notebook-pen';
export { default as Pencil } from 'lucide-react-native/icons/pencil';
export { default as Percent } from 'lucide-react-native/icons/percent';
export { default as PieChart } from 'lucide-react-native/icons/chart-pie';
export { default as PiggyBank } from 'lucide-react-native/icons/piggy-bank';
export { default as Plus } from 'lucide-react-native/icons/plus';
export { default as QrCode } from 'lucide-react-native/icons/qr-code';
export { default as Receipt } from 'lucide-react-native/icons/receipt';
export { default as RefreshCw } from 'lucide-react-native/icons/refresh-cw';
export { default as Repeat } from 'lucide-react-native/icons/repeat';
export { default as RotateCcw } from 'lucide-react-native/icons/rotate-ccw';
export { default as Search } from 'lucide-react-native/icons/search';
export { default as SearchX } from 'lucide-react-native/icons/search-x';
export { default as Settings } from 'lucide-react-native/icons/settings';
export { default as Share2 } from 'lucide-react-native/icons/share-2';
export { default as ShieldCheck } from 'lucide-react-native/icons/shield-check';
export { default as ShoppingBag } from 'lucide-react-native/icons/shopping-bag';
export { default as Sigma } from 'lucide-react-native/icons/sigma';
export { default as Star } from 'lucide-react-native/icons/star';
export { default as Target } from 'lucide-react-native/icons/target';
export { default as Timer } from 'lucide-react-native/icons/timer';
export { default as Trash2 } from 'lucide-react-native/icons/trash';
export { default as Umbrella } from 'lucide-react-native/icons/umbrella';
export { default as Undo2 } from 'lucide-react-native/icons/undo-2';
export { default as User } from 'lucide-react-native/icons/user';
export { default as UserMinus } from 'lucide-react-native/icons/user-minus';
export { default as UserPlus } from 'lucide-react-native/icons/user-plus';
export { default as Users } from 'lucide-react-native/icons/users';
export { default as Wallet } from 'lucide-react-native/icons/wallet';
export { default as X } from 'lucide-react-native/icons/x';
