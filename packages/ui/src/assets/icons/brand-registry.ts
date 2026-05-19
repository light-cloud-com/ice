/**
 * Brand Icon Registry — Real official logos via devicon (MIT licensed)
 *
 * Imports original multi-color SVG logos directly from the devicon package.
 * Each entry provides: SVG URL (for <image> rendering) and display label.
 *
 * Used as the PRIMARY icon source. Cloud provider icons (AWS/GCP/Azure) are secondary,
 * shown as a small badge below the brand logo.
 */

// =============================================================================
// Devicon SVG imports — original multi-color logos
// =============================================================================

// Databases
import adonisjs from 'devicon/icons/adonisjs/adonisjs-original.svg';
import amazonwebservices from 'devicon/icons/amazonwebservices/amazonwebservices-original-wordmark.svg';
import angular from 'devicon/icons/angular/angular-original.svg';
import ansible from 'devicon/icons/ansible/ansible-original.svg';
import apache from 'devicon/icons/apache/apache-original.svg';
import kafka from 'devicon/icons/apachekafka/apachekafka-original.svg';
import argocd from 'devicon/icons/argocd/argocd-original.svg';
import astro from 'devicon/icons/astro/astro-original.svg';
import azure from 'devicon/icons/azure/azure-original.svg';
import bash from 'devicon/icons/bash/bash-original.svg';
import bitbucket from 'devicon/icons/bitbucket/bitbucket-original.svg';
import bootstrap from 'devicon/icons/bootstrap/bootstrap-original.svg';
import bun from 'devicon/icons/bun/bun-original.svg';
import cLang from 'devicon/icons/c/c-original.svg';
import cassandra from 'devicon/icons/cassandra/cassandra-original.svg';
import circleci from 'devicon/icons/circleci/circleci-plain.svg';
import clickhouse from 'devicon/icons/clickhouse/clickhouse-original.svg';
import clojure from 'devicon/icons/clojure/clojure-original.svg';
import cloudflare from 'devicon/icons/cloudflare/cloudflare-original.svg';
import consul from 'devicon/icons/consul/consul-original.svg';
import couchdb from 'devicon/icons/couchbase/couchbase-original.svg';
import cplusplus from 'devicon/icons/cplusplus/cplusplus-original.svg';
import csharp from 'devicon/icons/csharp/csharp-original.svg';
import dart from 'devicon/icons/dart/dart-original.svg';
import datadog from 'devicon/icons/datadog/datadog-original.svg';
import debian from 'devicon/icons/debian/debian-original.svg';
import deno from 'devicon/icons/denojs/denojs-original.svg';
import digitalocean from 'devicon/icons/digitalocean/digitalocean-original.svg';
import django from 'devicon/icons/django/django-plain.svg';
import docker from 'devicon/icons/docker/docker-original.svg';
import dotnet from 'devicon/icons/dot-net/dot-net-original.svg';
import dynamodb from 'devicon/icons/dynamodb/dynamodb-original.svg';
import elasticsearch from 'devicon/icons/elasticsearch/elasticsearch-original.svg';
import elixir from 'devicon/icons/elixir/elixir-original.svg';
import erlang from 'devicon/icons/erlang/erlang-original.svg';
import express from 'devicon/icons/express/express-original.svg';
import fastapi from 'devicon/icons/fastapi/fastapi-original.svg';
import firebase from 'devicon/icons/firebase/firebase-original.svg';
import flask from 'devicon/icons/flask/flask-original.svg';
import gatsby from 'devicon/icons/gatsby/gatsby-original.svg';
import github from 'devicon/icons/github/github-original.svg';
import githubactions from 'devicon/icons/githubactions/githubactions-original.svg';
import gitlab from 'devicon/icons/gitlab/gitlab-original.svg';
import go from 'devicon/icons/go/go-original.svg';
import googlecloud from 'devicon/icons/googlecloud/googlecloud-original.svg';
import grafana from 'devicon/icons/grafana/grafana-original.svg';
import graphql from 'devicon/icons/graphql/graphql-plain.svg';
import haskell from 'devicon/icons/haskell/haskell-original.svg';
import helm from 'devicon/icons/helm/helm-original.svg';
import heroku from 'devicon/icons/heroku/heroku-original.svg';
import htmx from 'devicon/icons/htmx/htmx-original.svg';
import influxdb from 'devicon/icons/influxdb/influxdb-original.svg';
import jaeger from 'devicon/icons/jaegertracing/jaegertracing-original.svg';
import java from 'devicon/icons/java/java-original.svg';
import javascript from 'devicon/icons/javascript/javascript-original.svg';
import jenkins from 'devicon/icons/jenkins/jenkins-original.svg';
import kotlin from 'devicon/icons/kotlin/kotlin-original.svg';
import kubernetes from 'devicon/icons/kubernetes/kubernetes-original.svg';
import laravel from 'devicon/icons/laravel/laravel-original.svg';
import linux from 'devicon/icons/linux/linux-original.svg';
import lua from 'devicon/icons/lua/lua-original.svg';
import mariadb from 'devicon/icons/mariadb/mariadb-original.svg';
import microsoftsqlserver from 'devicon/icons/microsoftsqlserver/microsoftsqlserver-original.svg';
import mongodb from 'devicon/icons/mongodb/mongodb-original.svg';
import mysql from 'devicon/icons/mysql/mysql-original.svg';
import neo4j from 'devicon/icons/neo4j/neo4j-original.svg';
import nestjs from 'devicon/icons/nestjs/nestjs-original.svg';
import netlify from 'devicon/icons/netlify/netlify-original.svg';
import nextjs from 'devicon/icons/nextjs/nextjs-original.svg';
import nginx from 'devicon/icons/nginx/nginx-original.svg';
import nodejs from 'devicon/icons/nodejs/nodejs-original.svg';
import nuxtjs from 'devicon/icons/nuxtjs/nuxtjs-original.svg';
import html5 from 'devicon/icons/html5/html5-original.svg';
import hugo from 'devicon/icons/hugo/hugo-original.svg';
import jekyll from 'devicon/icons/jekyll/jekyll-original.svg';
import qwik from 'devicon/icons/qwik/qwik-original.svg';
import packer from 'devicon/icons/packer/packer-original.svg';
import perl from 'devicon/icons/perl/perl-original.svg';
import php from 'devicon/icons/php/php-original.svg';
import postgresql from 'devicon/icons/postgresql/postgresql-original.svg';
import postman from 'devicon/icons/postman/postman-original.svg';
import prometheus from 'devicon/icons/prometheus/prometheus-original.svg';
import pulumi from 'devicon/icons/pulumi/pulumi-original.svg';
import python from 'devicon/icons/python/python-original.svg';
import rLang from 'devicon/icons/r/r-original.svg';
import rabbitmq from 'devicon/icons/rabbitmq/rabbitmq-original.svg';
import rails from 'devicon/icons/rails/rails-original-wordmark.svg';
import railway from 'devicon/icons/railway/railway-original.svg';
import react from 'devicon/icons/react/react-original.svg';
import redhat from 'devicon/icons/redhat/redhat-original.svg';
import redis from 'devicon/icons/redis/redis-original.svg';
import remix from 'devicon/icons/remix/remix-original.svg';
import ruby from 'devicon/icons/ruby/ruby-original.svg';
import rust from 'devicon/icons/rust/rust-original.svg';
import scala from 'devicon/icons/scala/scala-original.svg';
import sentry from 'devicon/icons/sentry/sentry-original.svg';
import spring from 'devicon/icons/spring/spring-original.svg';
import sqlite from 'devicon/icons/sqlite/sqlite-original.svg';
import supabase from 'devicon/icons/supabase/supabase-original.svg';
import svelte from 'devicon/icons/svelte/svelte-original.svg';
import swift from 'devicon/icons/swift/swift-original.svg';
import tailwindcss from 'devicon/icons/tailwindcss/tailwindcss-original.svg';
import terraform from 'devicon/icons/terraform/terraform-original.svg';
import typescript from 'devicon/icons/typescript/typescript-original.svg';
import ubuntu from 'devicon/icons/ubuntu/ubuntu-original.svg';
import vagrant from 'devicon/icons/vagrant/vagrant-original.svg';
import vault from 'devicon/icons/vault/vault-original.svg';
import vercel from 'devicon/icons/vercel/vercel-original.svg';
import vite from 'devicon/icons/vitejs/vitejs-original.svg';
import vuejs from 'devicon/icons/vuejs/vuejs-original.svg';
import webpack from 'devicon/icons/webpack/webpack-original.svg';
import wordpress from 'devicon/icons/wordpress/wordpress-original.svg';
import zig from 'devicon/icons/zig/zig-original.svg';

// Frameworks & Libraries

// Infrastructure & DevOps

// Cloud Providers

// Messaging / Streaming

// Monitoring / Observability

// VCS

// Other

// =============================================================================
// Types
// =============================================================================

export interface BrandIcon {
  /** SVG URL (Vite-resolved import) for use in <image href> */
  url: string;
  /** Display label */
  label: string;
}

// =============================================================================
// Master Registry — keyed by lowercase lookup name
// =============================================================================

const REGISTRY: Record<string, BrandIcon> = {};

function reg(keys: string[], url: string, label: string) {
  const entry: BrandIcon = { url, label };
  for (const k of keys) {
    REGISTRY[k.toLowerCase()] = entry;
  }
}

// ─── Databases ──────────────────────────────────────────────────────────────
reg(['postgresql', 'postgres', 'pg', 'database.postgresql'], postgresql, 'PostgreSQL');
reg(['mysql', 'database.mysql'], mysql, 'MySQL');
reg(['mongodb', 'mongo', 'database.mongodb'], mongodb, 'MongoDB');
reg(['redis', 'database.redis'], redis, 'Redis');
reg(['sqlite', 'database.sqlite'], sqlite, 'SQLite');
reg(['mariadb', 'database.mariadb'], mariadb, 'MariaDB');
reg(['neo4j', 'database.neo4j'], neo4j, 'Neo4j');
reg(
  ['elasticsearch', 'opensearch', 'database.elasticsearch', 'database.opensearch', 'analytics.opensearch'],
  elasticsearch,
  'Elasticsearch',
);
reg(['cassandra', 'database.cassandra'], cassandra, 'Cassandra');
reg(['couchdb', 'couchbase', 'database.couchdb'], couchdb, 'CouchDB');
reg(['influxdb', 'database.influxdb'], influxdb, 'InfluxDB');
reg(['supabase', 'database.supabase'], supabase, 'Supabase');
reg(
  ['firestore', 'firebase', 'database.firestore', 'firebase-hosting', 'firebase.hosting', 'gcp.firebase.hosting'],
  firebase,
  'Firebase',
);
reg(['dynamodb', 'database.dynamodb'], dynamodb, 'DynamoDB');
reg(['clickhouse', 'database.clickhouse'], clickhouse, 'ClickHouse');
reg(['mssql', 'sqlserver', 'database.mssql', 'database.sqlserver'], microsoftsqlserver, 'SQL Server');

// ─── Runtimes / Languages ───────────────────────────────────────────────────
reg(['node', 'nodejs', 'node.js'], nodejs, 'Node.js');
reg(['python', 'py'], python, 'Python');
reg(['go', 'golang'], go, 'Go');
reg(['rust', 'rs'], rust, 'Rust');
reg(['java', 'jvm', 'openjdk'], java, 'Java');
reg(['ruby', 'rb'], ruby, 'Ruby');
reg(['php'], php, 'PHP');
reg(['dotnet', '.net'], dotnet, '.NET');
reg(['kotlin', 'kt'], kotlin, 'Kotlin');
reg(['swift'], swift, 'Swift');
reg(['typescript', 'ts'], typescript, 'TypeScript');
reg(['javascript', 'js'], javascript, 'JavaScript');
reg(['elixir', 'ex'], elixir, 'Elixir');
reg(['scala'], scala, 'Scala');
reg(['deno'], deno, 'Deno');
reg(['bun'], bun, 'Bun');
reg(['perl'], perl, 'Perl');
reg(['lua'], lua, 'Lua');
reg(['r', 'rlang'], rLang, 'R');
reg(['dart'], dart, 'Dart');
reg(['zig'], zig, 'Zig');
reg(['haskell', 'hs'], haskell, 'Haskell');
reg(['erlang', 'erl'], erlang, 'Erlang');
reg(['clojure', 'clj'], clojure, 'Clojure');
reg(['c'], cLang, 'C');
reg(['c++', 'cpp', 'cplusplus'], cplusplus, 'C++');
reg(['csharp', 'c#'], csharp, 'C#');
reg(['bash', 'sh', 'shell', 'zsh'], bash, 'Bash');

// ─── Frameworks & Libraries ─────────────────────────────────────────────────
reg(['react', 'reactjs', 'react.js'], react, 'React');
reg(['vue', 'vuejs', 'vue.js'], vuejs, 'Vue.js');
reg(['angular', 'angularjs'], angular, 'Angular');
reg(['svelte', 'sveltekit'], svelte, 'Svelte');
reg(['nextjs', 'next.js', 'next'], nextjs, 'Next.js');
reg(['nuxt', 'nuxtjs', 'nuxt.js'], nuxtjs, 'Nuxt');
reg(['express', 'expressjs', 'express.js'], express, 'Express');
reg(['fastapi', 'fast-api'], fastapi, 'FastAPI');
reg(['flask'], flask, 'Flask');
reg(['django'], django, 'Django');
reg(['spring', 'springboot', 'spring-boot'], spring, 'Spring');
reg(['rails', 'rubyonrails', 'ruby-on-rails'], rails, 'Rails');
reg(['laravel'], laravel, 'Laravel');
reg(['astro'], astro, 'Astro');
reg(['remix'], remix, 'Remix');
reg(['gatsby'], gatsby, 'Gatsby');
reg(['nestjs', 'nest'], nestjs, 'NestJS');
reg(['adonisjs', 'adonis'], adonisjs, 'AdonisJS');
reg(['htmx'], htmx, 'htmx');
reg(['tailwind', 'tailwindcss'], tailwindcss, 'Tailwind CSS');
reg(['bootstrap'], bootstrap, 'Bootstrap');
reg(['vite', 'vitejs'], vite, 'Vite');
reg(['webpack'], webpack, 'webpack');
reg(['html', 'html5'], html5, 'HTML5');
reg(['hugo'], hugo, 'Hugo');
reg(['jekyll'], jekyll, 'Jekyll');
reg(['qwik', 'qwikjs'], qwik, 'Qwik');

// ─── Infrastructure & DevOps ────────────────────────────────────────────────
reg(['docker'], docker, 'Docker');
reg(['kubernetes', 'k8s'], kubernetes, 'Kubernetes');
reg(['terraform', 'tf'], terraform, 'Terraform');
reg(['nginx'], nginx, 'NGINX');
reg(['apache', 'httpd'], apache, 'Apache');
reg(['consul'], consul, 'Consul');
reg(['vault', 'hashicorp-vault'], vault, 'Vault');
reg(['helm'], helm, 'Helm');
reg(['ansible'], ansible, 'Ansible');
reg(['packer'], packer, 'Packer');
reg(['vagrant'], vagrant, 'Vagrant');
reg(['pulumi'], pulumi, 'Pulumi');
reg(['argocd', 'argo'], argocd, 'Argo CD');
reg(['jenkins'], jenkins, 'Jenkins');
reg(['circleci'], circleci, 'CircleCI');
reg(['githubactions', 'github-actions'], githubactions, 'GitHub Actions');

// ─── Cloud Providers ────────────────────────────────────────────────────────
reg(['aws', 'amazonaws', 'amazon'], amazonwebservices, 'AWS');
reg(['gcp', 'googlecloud', 'google-cloud'], googlecloud, 'Google Cloud');
reg(['azure', 'microsoftazure'], azure, 'Azure');
reg(['digitalocean', 'do'], digitalocean, 'DigitalOcean');
reg(['cloudflare', 'cf'], cloudflare, 'Cloudflare');
reg(['vercel'], vercel, 'Vercel');
reg(['netlify'], netlify, 'Netlify');
reg(['railway'], railway, 'Railway');
reg(['heroku'], heroku, 'Heroku');

// ─── Messaging / Streaming ──────────────────────────────────────────────────
reg(['kafka', 'apachekafka', 'messaging.kafka'], kafka, 'Kafka');
reg(['rabbitmq', 'rabbit', 'messaging.rabbitmq'], rabbitmq, 'RabbitMQ');

// ─── Monitoring / Observability ─────────────────────────────────────────────
reg(['grafana', 'observability.dashboard', 'observability.grafana'], grafana, 'Grafana');
reg(['prometheus', 'observability.metrics', 'observability.prometheus'], prometheus, 'Prometheus');
reg(['datadog', 'observability.datadog'], datadog, 'Datadog');
reg(['sentry', 'observability.sentry'], sentry, 'Sentry');
reg(['jaeger', 'observability.tracing', 'observability.jaeger'], jaeger, 'Jaeger');

// ─── VCS / Git ──────────────────────────────────────────────────────────────
reg(['github'], github, 'GitHub');
reg(['gitlab'], gitlab, 'GitLab');
reg(['bitbucket'], bitbucket, 'Bitbucket');

// ─── Other ──────────────────────────────────────────────────────────────────
reg(['graphql', 'gql'], graphql, 'GraphQL');
reg(['postman'], postman, 'Postman');
reg(['wordpress', 'wp'], wordpress, 'WordPress');
reg(['ubuntu'], ubuntu, 'Ubuntu');
reg(['debian'], debian, 'Debian');
reg(['linux'], linux, 'Linux');
reg(['redhat', 'rhel'], redhat, 'Red Hat');

// =============================================================================
// Lookup Functions
// =============================================================================

/**
 * Look up a brand icon by any name — iceType, runtime, tech name, etc.
 * Tries exact match, then strips version, normalizes, and tries subtype.
 */
export function getBrandIcon(name: string): BrandIcon | null {
  if (!name) return null;
  const raw = name.toLowerCase().trim();

  // Direct match
  if (REGISTRY[raw]) return REGISTRY[raw];

  // Strip version suffix: "node.js 20" → "node.js", "go 1.21" → "go"
  const noVersion = raw.replace(/[\s._-]*\d[\d.]*.*$/, '').trim();
  if (REGISTRY[noVersion]) return REGISTRY[noVersion];

  // Remove dots/dashes/spaces: "node.js" → "nodejs", "vue.js" → "vuejs"
  const normalized = noVersion.replace(/[.\-_\s]/g, '');
  if (REGISTRY[normalized]) return REGISTRY[normalized];

  // First word only: "node" from "node.js 20"
  const first = raw.split(/[\s.\-_]/)[0];
  if (REGISTRY[first]) return REGISTRY[first];

  // Try the subtype after last dot: "Database.PostgreSQL" → "postgresql"
  const afterDot = raw.split('.').pop() || '';
  if (afterDot && REGISTRY[afterDot]) return REGISTRY[afterDot];

  return null;
}

/**
 * Get brand icon for a cloud provider name.
 */
export function getProviderBrandIcon(provider: string): BrandIcon | null {
  return getBrandIcon(provider);
}
