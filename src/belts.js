// Niveles de cinturón. El número es el que se guarda en la base de datos.
export const BELTS = [
  { nivel: 1, nombre: 'Blanco', color: '#FFFFFF', borde: '#8A9BB8' },
  { nivel: 2, nombre: 'Amarillo', color: '#F2C200', borde: '#F2C200' },
  { nivel: 3, nombre: 'Naranja', color: '#FF5A00', borde: '#FF5A00' },
  { nivel: 4, nombre: 'Verde', color: '#1E9E4A', borde: '#1E9E4A' },
  { nivel: 5, nombre: 'Azul', color: '#1D5FD1', borde: '#1D5FD1' },
  { nivel: 6, nombre: 'Marrón', color: '#7A4A24', borde: '#7A4A24' },
  { nivel: 7, nombre: 'Negro', color: '#12151C', borde: '#12151C' },
]

export function beltOf(nivel) {
  return BELTS.find((b) => b.nivel === nivel) ?? BELTS[0]
}
