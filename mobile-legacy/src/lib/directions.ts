import * as Linking from 'expo-linking';
import { Alert } from 'react-native';

/**
 * Ouvre un itinéraire vers une adresse en texte libre avec Google Maps (lien
 * universel : app si présente, navigateur sinon).
 *
 * Citymapper a été essayé en premier (`citymapper://directions?endaddress=`),
 * mais testé en conditions réelles il ouvre l'app sans calculer l'itinéraire :
 * son format fiable exige des coordonnées GPS (`endcoord`), pas juste une
 * adresse texte, ce qu'on n'a pas sans appel à une API de géocodage. Google
 * Maps calcule correctement l'itinéraire à partir d'une simple adresse.
 */
export async function openDirections(address: string): Promise<void> {
  const query = encodeURIComponent(address.trim());
  const googleMaps = `https://www.google.com/maps/search/?api=1&query=${query}`;
  try {
    await Linking.openURL(googleMaps);
  } catch {
    Alert.alert('Itinéraire indisponible', "Aucune application n'a pu ouvrir l'itinéraire vers cette adresse.");
  }
}
