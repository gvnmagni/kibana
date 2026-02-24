/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

interface DatasourceLayerColumns {
  [columnId: string]: { label?: string };
}

interface DatasourceLayers {
  [layerId: string]: { columns?: DatasourceLayerColumns };
}

interface VisLayer {
  layerId?: string;
  splitAccessors?: string[];
  primaryGroups?: string[];
}

interface AttributesState {
  visualization?: { layers?: VisLayer[] };
  datasourceStates?: Record<string, { layers?: DatasourceLayers }>;
}

/**
 * Extracts the display name of the first breakdown/split dimension from Lens attributes,
 * for use with Smart Title. Supports XY (splitAccessors) and partition (primaryGroups) charts.
 */
export function getBreakdownFieldNameFromAttributes(attributes: {
  state?: AttributesState;
}): string | undefined {
  const state = attributes?.state;
  if (!state?.visualization || !state?.datasourceStates) return undefined;

  const layers = state.visualization.layers;
  if (!layers?.length) return undefined;

  let layerId: string | undefined;
  let columnId: string | undefined;

  for (const layer of layers) {
    const firstSplit = layer.splitAccessors?.[0] ?? layer.primaryGroups?.[0];
    if (firstSplit) {
      layerId = layer.layerId;
      columnId = firstSplit;
      break;
    }
  }

  if (!layerId || !columnId) return undefined;

  const dsStates = state.datasourceStates;
  const dsState = dsStates.formBased ?? dsStates.indexpattern;
  const dsLayers = dsState?.layers;
  const columns = dsLayers?.[layerId]?.columns;
  const column = columns?.[columnId];
  return column?.label;
}
