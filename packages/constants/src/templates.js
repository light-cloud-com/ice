/**
 * Template Constants
 *
 * Template categories, difficulty levels, trust levels, compliance tags,
 * and group color conventions used in template definitions.
 */
import { COLORS } from './colors.js';
export const TEMPLATE_CATEGORIES = [
    {
        id: 'quick-start',
        label: 'Quick Starts',
        description: 'Minimal starters to get going fast',
        icon: 'Zap',
        color: COLORS.amber,
    },
    {
        id: 'full-stack',
        label: 'Full Stack',
        description: 'Complete application stacks',
        icon: 'Rocket',
        color: COLORS.blue,
    },
    {
        id: 'backend',
        label: 'Backend & API',
        description: 'API services and microservices',
        icon: 'Server',
        color: COLORS.green,
    },
    {
        id: 'serverless',
        label: 'Serverless',
        description: 'Functions-first architectures',
        icon: 'Zap',
        color: COLORS.cyan,
    },
    {
        id: 'data-pipeline',
        label: 'Data Pipelines',
        description: 'Event-driven and batch processing',
        icon: 'Activity',
        color: COLORS.violet,
    },
    {
        id: 'ai-ml',
        label: 'AI & ML',
        description: 'Machine learning and AI workloads',
        icon: 'Brain',
        color: COLORS.pink,
    },
    {
        id: 'e-commerce',
        label: 'E-Commerce',
        description: 'Online store and marketplace patterns',
        icon: 'ShoppingCart',
        color: COLORS.orange,
    },
    {
        id: 'mobile',
        label: 'Mobile Backend',
        description: 'Mobile app backend patterns',
        icon: 'Smartphone',
        color: COLORS.teal,
    },
    {
        id: 'compliance',
        label: 'Compliance',
        description: 'Security and regulatory focused',
        icon: 'ShieldCheck',
        color: COLORS.emerald,
    },
    {
        id: 'devops',
        label: 'DevOps',
        description: 'CI/CD, monitoring, and platform tooling',
        icon: 'GitBranch',
        color: COLORS.slate500,
    },
    {
        id: 'healthcare',
        label: 'Healthcare',
        description: 'HIPAA-compliant patient data and clinical systems',
        icon: 'Heart',
        color: COLORS.red,
    },
    {
        id: 'fintech',
        label: 'Fintech & Banking',
        description: 'Payment processing, transactions, and compliance',
        icon: 'Landmark',
        color: COLORS.sky,
    },
    {
        id: 'media',
        label: 'Media & Streaming',
        description: 'Video, audio, and content delivery platforms',
        icon: 'Play',
        color: COLORS.purple,
    },
    {
        id: 'saas',
        label: 'SaaS',
        description: 'Multi-tenant software-as-a-service platforms',
        icon: 'Cloud',
        color: COLORS.indigo,
    },
    {
        id: 'iot',
        label: 'IoT',
        description: 'Device management and telemetry ingestion',
        icon: 'Cpu',
        color: COLORS.lime,
    },
    {
        id: 'gaming',
        label: 'Gaming',
        description: 'Game servers, leaderboards, and real-time systems',
        icon: 'Gamepad2',
        color: COLORS.rose,
    },
    {
        id: 'logistics',
        label: 'Logistics & Supply Chain',
        description: 'Fleet tracking, inventory, and warehouse management',
        icon: 'Truck',
        color: COLORS.stone500,
    },
    {
        id: 'education',
        label: 'Education',
        description: 'Learning platforms, course management, and assessments',
        icon: 'GraduationCap',
        color: COLORS.blueDeep,
    },
];
/**
 * Default group/container fill color. Used whenever a freshly-created
 * group doesn't have its own brand color yet, and as the icon-tint
 * fallback for category/template displays.
 */
export const DEFAULT_GROUP_COLOR = COLORS.blue;
/**
 * Default container fill opacity. The two slightly-different LOD-specific
 * values (0.09 / 0.12) are zoom-level tweaks — keep them inline at the
 * call site; this constant is the "no zoom adjustment" baseline used by
 * the properties panel and the LOD-3 fallback path.
 */
export const DEFAULT_GROUP_OPACITY = 0.1;
/** Standard colors for well-known group labels in templates. */
export const GROUP_COLORS = {
    'Public Zone': COLORS.red,
    VPC: COLORS.green,
    'Public Subnet': COLORS.blue,
    'Private Subnet': COLORS.indigo,
    Monitoring: COLORS.amber,
    'Security Controls': COLORS.violet,
    Async: COLORS.violet,
    'Platform Services': COLORS.slate500,
};
