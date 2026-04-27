/**
 * ICE Resource Tree — pure data, zero logic.
 *
 * TREE is the single source of truth.
 * ICE provides typed path constants.
 * Flat lookup maps are in derived.ts.
 */
declare const Cat: {
    readonly Compute: "Compute";
    readonly Data: "Data";
    readonly Network: "Network";
    readonly Security: "Security";
    readonly Observability: "Observability";
};
export { Cat };
export type NodeCategory = (typeof Cat)[keyof typeof Cat];
export interface ResourceEntry {
    readonly id: string;
    readonly aliases?: readonly string[];
    readonly port?: number;
    readonly envVar?: string;
    readonly required?: readonly string[];
}
export declare const TREE: {
    readonly Compute: {
        readonly category: "Compute";
        readonly resources: {
            readonly StaticSite: {
                readonly id: "frontend-app";
            };
            readonly SSRSite: {
                readonly id: "ssr-site";
            };
            readonly Container: {
                readonly id: "container-service";
                readonly aliases: readonly ["BackendAPI"];
                readonly required: readonly ["size", "runtime", "port"];
            };
            readonly Worker: {
                readonly id: "worker";
                readonly required: readonly ["size", "runtime"];
            };
            readonly CronJob: {
                readonly id: "scheduled-task";
                readonly required: readonly ["runtime"];
            };
            readonly ServerlessFunction: {
                readonly id: "serverless-function";
                readonly aliases: readonly ["Function"];
                readonly required: readonly ["memory", "timeout", "runtime"];
            };
        };
    };
    readonly Database: {
        readonly category: "Data";
        readonly resources: {
            readonly PostgreSQL: {
                readonly id: "postgres-db";
                readonly port: 5432;
                readonly envVar: "DATABASE_URL";
                readonly required: readonly ["size", "storage", "version"];
            };
            readonly MySQL: {
                readonly id: "mysql-db";
                readonly port: 3306;
                readonly envVar: "DATABASE_URL";
                readonly required: readonly ["size", "storage", "version"];
            };
            readonly MongoDB: {
                readonly id: "mongodb-db";
                readonly port: 27017;
                readonly envVar: "MONGODB_URI";
            };
            readonly Redis: {
                readonly id: "redis-cache";
                readonly port: 6379;
                readonly envVar: "REDIS_URL";
                readonly required: readonly ["size"];
            };
            readonly DynamoDB: {
                readonly id: "dynamodb";
            };
            readonly Firestore: {
                readonly id: "firestore";
            };
            readonly CosmosDB: {
                readonly id: "cosmosdb";
            };
            readonly AutonomousDB: {
                readonly id: "autonomous-db";
            };
            readonly Tablestore: {
                readonly id: "tablestore";
            };
            readonly ManagedDB: {
                readonly id: "do-managed-db";
            };
        };
    };
    readonly Storage: {
        readonly category: "Data";
        readonly resources: {
            readonly Bucket: {
                readonly id: "object-storage";
                readonly aliases: readonly ["ObjectStorage", "S3", "GCS", "Blob"];
                readonly envVar: "STORAGE_BUCKET";
                readonly required: readonly ["storage_class"];
            };
        };
    };
    readonly Messaging: {
        readonly category: "Data";
        readonly resources: {
            readonly SQS: {
                readonly id: "sqs";
                readonly aliases: readonly ["Queue"];
                readonly envVar: "SQS_QUEUE_URL";
                readonly required: readonly ["queue_type"];
            };
            readonly SNS: {
                readonly id: "sns";
                readonly envVar: "SNS_TOPIC_ARN";
            };
            readonly RabbitMQ: {
                readonly id: "rabbitmq";
                readonly port: 5672;
                readonly envVar: "AMQP_URL";
                readonly required: readonly ["size"];
            };
            readonly CloudPubSub: {
                readonly id: "cloud-pubsub";
                readonly aliases: readonly ["Kafka", "EventStream"];
                readonly envVar: "PUBSUB_TOPIC";
                readonly required: readonly ["keep_messages"];
            };
            readonly ServiceBus: {
                readonly id: "service-bus";
                readonly envVar: "SERVICE_BUS_CONNECTION";
            };
            readonly Topic: {
                readonly id: "sns";
            };
            readonly Queue: {
                readonly id: "message-queue";
                readonly envVar: "QUEUE_URL";
            };
            readonly EventStream: {
                readonly id: "event-stream";
                readonly envVar: "EVENT_STREAM_URL";
            };
            readonly Email: {
                readonly id: "email-service";
                readonly envVar: "EMAIL_SERVICE_URL";
            };
        };
    };
    readonly Network: {
        readonly category: "Network";
        readonly resources: {
            readonly Gateway: {
                readonly id: "api-gateway";
                readonly required: readonly ["protocol"];
            };
            readonly PublicEndpoint: {
                readonly id: "public-endpoint";
                readonly aliases: readonly ["LoadBalancer"];
            };
            readonly CustomDomain: {
                readonly id: "custom-domain";
            };
            readonly PrivateNetwork: {
                readonly id: "private-network";
            };
            readonly VPC: {
                readonly id: "vpc-network";
            };
            readonly Subnet: {
                readonly id: "subnet";
            };
            readonly PublicTraffic: {
                readonly id: "public-traffic";
            };
        };
    };
    readonly Security: {
        readonly category: "Security";
        readonly resources: {
            readonly Identity: {
                readonly id: "service-account";
                readonly envVar: "AUTH_URL";
            };
            readonly Secret: {
                readonly id: "secrets-manager";
                readonly envVar: "SECRETS_ARN";
            };
            readonly WAF: {
                readonly id: "waf";
            };
            readonly Certificate: {
                readonly id: "ssl-certificate";
                readonly aliases: readonly ["SSLCertificate"];
            };
        };
    };
    readonly Monitoring: {
        readonly category: "Observability";
        readonly resources: {
            readonly Log: {
                readonly id: "log-group";
                readonly required: readonly ["keep_logs"];
            };
        };
    };
    readonly AI: {
        readonly category: "Compute";
        readonly resources: {
            readonly VectorDB: {
                readonly id: "vector-db";
                readonly envVar: "VECTOR_DB_URL";
            };
            readonly LLMGateway: {
                readonly id: "llm-gateway";
                readonly envVar: "LLM_API_URL";
            };
            readonly ModelServing: {
                readonly id: "ml-model";
            };
            readonly PrivateAIService: {
                readonly id: "private-ai-service";
                readonly envVar: "PRIVATE_AI_URL";
            };
        };
    };
    readonly Analytics: {
        readonly category: "Data";
        readonly resources: {
            readonly Search: {
                readonly id: "search-engine";
                readonly port: 9200;
                readonly envVar: "ELASTICSEARCH_URL";
            };
            readonly DataWarehouse: {
                readonly id: "data-warehouse";
                readonly envVar: "DATA_WAREHOUSE_URL";
            };
        };
    };
    readonly Source: {
        readonly category: "Compute";
        readonly resources: {
            readonly Repository: {
                readonly id: "";
                readonly required: readonly ["repository", "branch"];
            };
        };
    };
    readonly Config: {
        readonly category: "Compute";
        readonly resources: {
            readonly Environment: {
                readonly id: "";
            };
        };
    };
};
export declare const ICE: {
    readonly Compute: {
        readonly StaticSite: "Compute.StaticSite";
        readonly SSRSite: "Compute.SSRSite";
        readonly Container: "Compute.Container";
        readonly Worker: "Compute.Worker";
        readonly CronJob: "Compute.CronJob";
        readonly ServerlessFunction: "Compute.ServerlessFunction";
    };
    readonly Database: {
        readonly PostgreSQL: "Database.PostgreSQL";
        readonly MySQL: "Database.MySQL";
        readonly MongoDB: "Database.MongoDB";
        readonly Redis: "Database.Redis";
        readonly DynamoDB: "Database.DynamoDB";
        readonly Firestore: "Database.Firestore";
        readonly CosmosDB: "Database.CosmosDB";
        readonly AutonomousDB: "Database.AutonomousDB";
        readonly Tablestore: "Database.Tablestore";
        readonly ManagedDB: "Database.ManagedDB";
    };
    readonly Storage: {
        readonly Bucket: "Storage.Bucket";
    };
    readonly Messaging: {
        readonly SQS: "Messaging.SQS";
        readonly SNS: "Messaging.SNS";
        readonly RabbitMQ: "Messaging.RabbitMQ";
        readonly CloudPubSub: "Messaging.CloudPubSub";
        readonly ServiceBus: "Messaging.ServiceBus";
        readonly Topic: "Messaging.Topic";
        readonly Queue: "Messaging.Queue";
        readonly EventStream: "Messaging.EventStream";
        readonly Email: "Messaging.Email";
    };
    readonly Network: {
        readonly Gateway: "Network.Gateway";
        readonly PublicEndpoint: "Network.PublicEndpoint";
        readonly CustomDomain: "Network.CustomDomain";
        readonly PrivateNetwork: "Network.PrivateNetwork";
        readonly VPC: "Network.VPC";
        readonly Subnet: "Network.Subnet";
        readonly PublicTraffic: "Network.PublicTraffic";
    };
    readonly Security: {
        readonly Identity: "Security.Identity";
        readonly Secret: "Security.Secret";
        readonly WAF: "Security.WAF";
        readonly Certificate: "Security.Certificate";
    };
    readonly Monitoring: {
        readonly Log: "Monitoring.Log";
    };
    readonly AI: {
        readonly VectorDB: "AI.VectorDB";
        readonly LLMGateway: "AI.LLMGateway";
        readonly ModelServing: "AI.ModelServing";
        readonly PrivateAIService: "AI.PrivateAIService";
    };
    readonly Analytics: {
        readonly Search: "Analytics.Search";
        readonly DataWarehouse: "Analytics.DataWarehouse";
    };
    readonly Source: {
        readonly Repository: "Source.Repository";
    };
    readonly Config: {
        readonly Environment: "Config.Environment";
    };
};
