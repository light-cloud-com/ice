/**
 * Tests for the AWS importer barrel module.
 *
 * `index.ts` is a pure re-export. Test that the public surface is wired up
 * — name, identity to the underlying export, and stable type membership.
 */

import { describe, it, expect } from 'vitest';
import * as awsBarrel from '../index.js';
import { import_aws as import_aws_src, import_aws_to_graph as import_aws_to_graph_src } from '../aws-importer.js';
import { aws_result_to_graph as aws_result_to_graph_src } from '../graph-conversion.js';
import {
  get_ice_type as get_ice_type_src,
  is_type_supported as is_type_supported_src,
  get_supported_types as get_supported_types_src,
  map_properties as map_properties_src,
} from '../type-mapper.js';

describe('aws importer barrel', () => {
  it('re-exports import_aws from aws-importer', () => {
    expect(awsBarrel.import_aws).toBe(import_aws_src);
  });

  it('re-exports import_aws_to_graph from aws-importer', () => {
    expect(awsBarrel.import_aws_to_graph).toBe(import_aws_to_graph_src);
  });

  it('re-exports aws_result_to_graph (sourced from graph-conversion)', () => {
    expect(awsBarrel.aws_result_to_graph).toBe(aws_result_to_graph_src);
  });

  it('re-exports get_ice_type from type-mapper', () => {
    expect(awsBarrel.get_ice_type).toBe(get_ice_type_src);
  });

  it('re-exports is_type_supported from type-mapper', () => {
    expect(awsBarrel.is_type_supported).toBe(is_type_supported_src);
  });

  it('re-exports get_supported_types from type-mapper', () => {
    expect(awsBarrel.get_supported_types).toBe(get_supported_types_src);
  });

  it('re-exports map_properties from type-mapper', () => {
    expect(awsBarrel.map_properties).toBe(map_properties_src);
  });
});
