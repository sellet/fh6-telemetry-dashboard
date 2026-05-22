import L from 'leaflet';

/**
 * A CRS.Simple variant whose Y axis grows downward (transformation 1,0,1,0),
 * so a standard XYZ tile pyramid lines up with project()/unproject() and the
 * game's `+Z = north` convention stays consistent.
 */
export function makeMapCrs(): L.CRS {
  return L.Util.extend({}, L.CRS.Simple, {
    transformation: new L.Transformation(1, 0, 1, 0),
  }) as L.CRS;
}
