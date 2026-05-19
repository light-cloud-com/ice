CREATE TABLE providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  namespace TEXT,
  source TEXT NOT NULL,
  version TEXT,
  resource_count INTEGER DEFAULT 0,
  extracted_at TEXT
);
CREATE TABLE resource_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ice_type TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  source TEXT,
  deprecated INTEGER DEFAULT 0,
  deprecation_message TEXT
);
CREATE TABLE implementations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_type_id INTEGER NOT NULL REFERENCES resource_types(id),
  source TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  native_type TEXT NOT NULL,
  docs_url TEXT,
  provider_version TEXT,
  UNIQUE(resource_type_id, source, provider_name)
);
CREATE TABLE properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_type_id INTEGER NOT NULL REFERENCES resource_types(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  required INTEGER DEFAULT 0,
  computed INTEGER DEFAULT 0,
  sensitive INTEGER DEFAULT 0,
  deprecated INTEGER DEFAULT 0,
  default_value TEXT,
  parent_property_id INTEGER REFERENCES properties(id),
  element_type TEXT,
  sort_order INTEGER DEFAULT 0
);
CREATE TABLE property_validations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  pattern TEXT,
  min_value REAL,
  max_value REAL,
  min_length INTEGER,
  max_length INTEGER,
  min_items INTEGER,
  max_items INTEGER
);
CREATE TABLE property_enum_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  value TEXT NOT NULL
);
CREATE TABLE resource_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type_id INTEGER NOT NULL REFERENCES resource_types(id),
  target_type_id INTEGER NOT NULL REFERENCES resource_types(id),
  relationship_type TEXT NOT NULL,
  property_name TEXT,
  cardinality TEXT,
  description TEXT,
  confidence REAL DEFAULT 1.0,
  inferred INTEGER DEFAULT 0,
  source TEXT,
  UNIQUE(source_type_id, target_type_id, relationship_type, property_name)
);
CREATE TABLE equivalents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ice_type TEXT NOT NULL,
  source TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  native_type TEXT NOT NULL,
  confidence REAL DEFAULT 1.0,
  UNIQUE(ice_type, source, provider_name)
);
CREATE TABLE schema_metadata (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);
CREATE INDEX idx_properties_resource ON properties(resource_type_id);
CREATE INDEX idx_implementations_resource ON implementations(resource_type_id);
CREATE INDEX idx_resource_types_category ON resource_types(category);
CREATE INDEX idx_property_validations_property ON property_validations(property_id);
CREATE INDEX idx_property_enum_values_property ON property_enum_values(property_id);
CREATE INDEX idx_relationships_source ON resource_relationships(source_type_id);
CREATE INDEX idx_relationships_target ON resource_relationships(target_type_id);
