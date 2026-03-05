# Rapport Technique : Jumeau Numérique d'Entrepôt (Digital Twin Warehouse)

## 1. Introduction et Contexte du Projet

Le projet **Digital Twin Warehouse** (Jumeau Numérique d'Entrepôt) est une application web interactive qui simule en temps réel les opérations logistiques complexes d'un entrepôt pharmaceutique. L'objectif principal de ce projet est de fournir une visualisation 3D hautement réaliste, similaire à des logiciels professionnels comme FlexSim, tout en offrant des fonctionnalités de gestion et de surveillance via un tableau de bord (Dashboard). 

La combinaison d'une interface utilisateur moderne et d'un moteur de rendu 3D optimisé permet aux utilisateurs d'observer le flux de préparation des commandes, le réapprovisionnement dynamique des stocks, et le contrôle qualité des colis sur le convoyeur. Le système a été conçu pour être à la fois visuellement immersif et techniquement robuste, garantissant une fluidité de fonctionnement directement dans le navigateur.

![Aperçu Global de l'Entrepôt](./public/screenshots/warehouse_overview_1772482387495.png)

---

## 2. Architecture Globale et Choix Technologiques

Pour atteindre cet équilibre entre performances graphiques et logique métier complexe, le projet repose sur une pile technologique moderne :

- **React & Vite** : Utilisés comme fondements pour structurer l'interface utilisateur. Vite offre une expérience de développement ultra-rapide et un build optimisé pour la production.
- **React Three Fiber (R3F) & Three.js** : Au cœur de la modélisation 3D, R3F permet de déclarer la scène 3D sous forme de composants React. Three.js assure le rendu WebGL matériellement accéléré.
- **Zustand** : Une bibliothèque minimaliste et performante de gestion d'état responsable de la synchronisation entre le moteur de simulation métier et l'interface utilisateur 3D.
- **Tailwind CSS** : Utilisé pour styliser les panneaux latéraux, le tableau de bord, et les superpositions d'interface (UI) sans alourdir les fichiers CSS.

L'architecture sépare strictement la logique de simulation (`Engine.js`) du rendu visuel (`WarehouseMap.jsx`), permettant ainsi à la simulation de s'exécuter de manière déterministe et indépendante du taux de rafraîchissement graphique.

---

## 3. Modélisation 3D, Rendu Visuel et Réalisme

L'un des défis majeurs a été d'obtenir un rendu industriel réaliste sans surcharger le navigateur (Low-Poly Performant).

### 3.1. Environnement et Matériaux Physiques (PBR)
Le sol de l'entrepôt est texturé avec un matériau de béton (`color: "#b3b8c2"`) doté d'une faible composante métallique, recevant de manière dynamique les ombres projetées par l'ensemble des éléments de la scène.
L'éclairage est une combinaison équilibrée :
- Une **Directional Light** principale qui génère les ombres portées (avec un `shadow-mapSize` de 2048x2048 pour la netteté et un biais ajusté pour éviter les artefacts visuels).
- Une **Hemisphere Light** pour simuler la lumière ambiante typique des grands hangars.

### 3.2. Rayonnages (Racks) et Boîtes de Stockage
Les racks de l'entrepôt utilisent des couleurs métalliques réalistes : un gris métal foncé pour les poteaux verticaux et un gris plus clair pour les poutres horizontales. La grande innovation graphique réside dans la subdivision des stocks : au lieu de dessiner de gros blocs transparents pour indiquer le taux de remplissage, l'application génère de manière procédurale des dizaines de boîtes individuelles opaques sur les étagères, donnant l'illusion parfaite d'une zone de palettes remplie de cartons ou de caisses en plastique mat.

### 3.3. Le Convoyeur Tapis Roulant
Le cœur de la zone de contrôle (Pilulier/Ctrl) est équipé d'un convoyeur modélisé avec un réalisme algorithmique.
- **Les Rouleaux** : Une série de cylindres métalliques est disposée tout le long du convoyeur. Un hook React `useFrame` fait tourner physiquement chaque rouleau autour de son axe local en temps réel.
- **Les Colis** : Les préparateurs déposent les colis qui glissent ensuite de manière fluide le long de la rampe pour atteindre la fin de chaîne.

![Vue sur le Convoyeur et Zone de Contrôle](./public/screenshots/conveyor_verification_1772482857124.png)

### 3.4. Animations Humanoïdes Procédurales (Agents FlexSim Style)
Pour éviter la lourdeur des squelettes animés importés (Bones/Rigging), les agents bénéficient d'une animation corporelle générée mathématiquement (procédurale) pendant la boucle de rendu :
- **Marche Dynamique** : Lorsqu'un agent se déplace vers un nœud, ses deux jambes se balancent de manière opposée selon une fonction sinusoïdale liée au temps (`Math.sin(elapsedTime)`). 
- **Oscillation du Buste** : Le corps (gilet) et la tête subissent un léger mouvement vertical répétitif imitant les pas lourds d'un opérateur logistique. 
- **Retour au repos** : Dès que l'agent atteint sa cible ou effectue une tâche statique, une transition lisse (Lerp) remet les jambes droites et le corps au repos.

---

## 4. Moteur de Simulation (Simulation Engine)

Le cerveau de l'entrepôt est structuré autour d'une classe Javascript orientée objet (`Engine.js`). Cette instance est mise à jour en continue via une fonction de rafraîchissement propulsée en tâche de fond.

### 4.1. Le Graphe de Déplacement (Pathfinding)
Le déplacement des agents s'appuie sur un graphe composé de *Nodes* (Nœuds) et d'*Edges* (Arêtes). Tous les mouvements d'un point A à un point B de l'entrepôt utilisent un algorithme **A*** (A-Star). L'architecture des nœuds a été calibrée pour forcer les agents à emprunter les couloirs et à contourner de manière stricte la zone centrale complexe du "Pilulier" pour éviter le "clipping" à l'écran.

### 4.2. L'Horloge Interne
L'Engine fonctionne grâce à un paramètre de *Delta Time* (`dt`). Cela permet de gérer le multiplicateur de vitesse (Speed : 1x, 2x, 5x, 10x). Le temps écoulé dans le jeu fait croître les chronomètres internes (les temps de "picking", les temps de "control") sans altérer la fréquence de la logique.

---

## 5. Intelligence Artificielle et Logique Métier (FSM)

Les 7 agents de l'entrepôt (3 Pickers, 3 Storekeepers, 1 Controller) possèdent chacun une machine à états finis (Finite State Machine). Chaque agent vérifie en boucle son état (Idle) pour déterminer sa tâche la plus prioritaire.

### 5.1. Logique Universelle de Réapprovisionnement
L'une des fonctions les plus abouties est le réapprovisionnement dynamique :
- Lorsqu'une commande sortante puise trop dans une étagère de *picking* et que sa quantité tombe sous le seuil critique (ex: < 20), une requête de remplissage est générée.
- **Délégation** : Ce sont les agents Rouges (*Pickers*) qui, lorsqu'ils n'ont plus de commandes urgentes, assument le réapprovisionnement.
- **Recherche Goutte-à-Goutte** : Ils calculent d'abord s'il existe une réserve explicitement affiliée à l'étagère vide. S'il n'y en a pas, ou que la réserve est vide, l'algorithme lance un balayage global de l'entrepôt pour extraire la ressource manquante de **n'importe quelle zone de stockage** disponible, garantissant ainsi qu'aucune zone de picking ne reste définitivement vide à `0/100`.

![Activité des Agents lors du Réapprovisionnement](./public/screenshots/shuffled_stock_activity_1772483610044.png)

### 5.2. Logistique de Préparation et d'Expédition
- **Picking** : Le préparateur reçoit la commande, navigue vers la zone A, B, C, etc., s'amarre pendant quelques secondes (selon la quantité), prélève le stock, et marche jusqu'au début de la rampe de convoyeur pour y larguer un cube coloré.
- **Contrôle Qualité** : L'agent Vert (*Controller* - reconnaissable à son casque coordonné) arpente la station Pilulier. Dès qu'un paquet arrive au bout du tapis roulant, il le saisit. S'ensuit une temporisation liée au contrôle qualité humain.
- **Expédition** : Après examen, ce même agent livre la commande validée à la baie d'Expédition ("Shipping Outbound"), incrémentant par la même occasion la jauge de "Completed Orders".

---

## 6. Interface Utilisateur (UI) / Tableau de Bord

Bien que le projet soit intimement lié à l'espace 3D, l'interaction utilisateur est rendue intuitive par une interface flottante développée avec Tailwind CSS.

### 6.1. Le Hub d'Information (Dashboard)
Sous l'espace 3D principal loge une liste dynamique des commandes (Pending, On_Conveyor, Controlled, Completed). Mais c'est sur la droite de l'écran que s'illustre  le cœur analytique :
- Suivi en direct du nombre total des commandes planifiées, en transit et terminées.
- Compteur des réapprovisionnements (Replenishments) permettant à l'observateur d’évaluer la fréquence de remplissage des rayons.

### 6.2. Contrôle Divin (Sidebar)
L’utilisateur peut influencer le déroulement de la simulation de diverses manières :
- Ajout de commandes aléatoires supplémentaires pour provoquer des ruptures de charge massives.
- Manipulation du multiplicateur de vitesse pour "Skipper" le temps (utile pour diagnostiquer rapidement les goulots d'étranglement logistiques à long terme).
- Le nouveau bouton **Randomize Stock (🔀)**, redoutable pour stresser l'algorithme de réapprovisionnement en secouant littéralement le niveau de tous les stocks des zones de façon aléatoire.

![Visuels 3D et Tableau de bord](./public/screenshots/improved_warehouse_visuals_1772483517175.png)

---

## 7. Défis Techniques et Optimisations Appliquées

### 7.1. Gestion de la Synchronisation Redux/Zustand avec l'Animation
Le défi majeur de lier l'état d'objets métiers purs (`Engine.js`) avec le rendu temporel (React Three Fiber) a été de limiter les "Renders" superflus. Au lieu de re-calculer les géométries à chaque image de simulation (60 FPS), des références vers des géométries monolithiques partagées (`sharedGeo`) et des matériaux (`sharedMat`) sont allouées en mémoire via `useMemo`. 
L'état des tableaux (réappro, commandes) est quant à lui mis en cache de telle façon que l'UI texte/Tailwind ne se rafraîchit que toutes les ~200ms dans `useSimulation.js`, garantissant que le Canvas 3D de l'entrepôt capte un maximum de CPU.

### 7.2. Ajustements du Clipping et Z-Fighting
Lors du premier montage, les boîtes de stock se mélangeaient à l'armature des étagères. Un ajustement fin en trigonométrie et la déclaration précise d'Offsets au millimètre (ex: `position={[0, sy + boxH / 2 + 0.03, 0]}`) a supprimé l'ensemble des z-fightings.

---

## 8. Système d'Évitement de Collisions (Collision Avoidance)

L'un des ajouts les plus importants au moteur de simulation est un système complet d'évitement de collisions entre agents. Ce système fonctionne entièrement au sein de la méthode `followPath()` de `Engine.js`, sans modifier la logique de pathfinding A* existante.

### 8.1. Détection de Proximité

À chaque itération du moteur, avant de déplacer un agent le long de son chemin, le système calcule la **distance euclidienne** entre cet agent et chaque autre agent de la simulation :

```
separation = √((other.x - agent.x)² + (other.y - agent.y)²)
```

Si cette distance est inférieure au rayon de collision configuré (`COLLISION_DIST = 75` unités), le système active les mécanismes d'avoidance. Ce rayon a été calibré expérimentalement pour correspondre à la distance visuelle réaliste entre deux opérateurs dans un entrepôt.

### 8.2. Calcul des Vecteurs de Direction (Heading Vectors)

Pour déterminer le type de rencontre entre deux agents, le système calcule le **cap normalisé** (heading vector) de chaque agent vers son prochain nœud de chemin :

```
heading = (targetNode.position - agent.position) / ||targetNode.position - agent.position||
```

Le **produit scalaire** (dot product) entre les deux vecteurs de cap détermine la relation géométrique :
- `dot < -0.3` → Les agents se déplacent dans des **directions opposées** (rencontre frontale)
- `dot ≥ -0.3` → Les agents se déplacent dans la **même direction** ou se croisent latéralement

### 8.3. Stratégie 1 : Esquive Latérale (Head-On Dodge)

Lorsque deux agents se dirigent l'un vers l'autre (frontalement), **les deux agents esquivent simultanément vers leur droite respective**. L'offset perpendiculaire est calculé à partir du vecteur de direction de l'agent :

```javascript
// Vecteur perpendiculaire (droite) = (-heading.y, heading.x)
dodgeX += (-hdy) * speed * pushStrength * 0.6;
dodgeY += (hdx) * speed * pushStrength * 0.6;
```

Le `pushStrength` est proportionnel à la proximité : plus les agents sont proches, plus la force de déviation est intense. Cette force est **proportionnelle à la vitesse de déplacement** (`speed = 150 unités/s`) pour garantir un décalage visible et efficace.

De plus, la vitesse de l'agent est réduite pendant l'approche frontale pour laisser le temps à l'esquive de s'effectuer :
```javascript
speedMultiplier = min(speedMultiplier, 0.5 + (separation / COLLISION_DIST) * 0.5)
```

### 8.4. Stratégie 2 : Décélération Progressive (Following Slowdown)

Quand un agent rattrape un autre agent dans la même direction de déplacement, il **ralentit progressivement** au lieu de s'arrêter brusquement. La vitesse est réduite linéairement en fonction de la distance :

```javascript
speedMultiplier = min(speedMultiplier, 0.15 + (separation / COLLISION_DIST) * 0.85)
```

Cela produit un comportement naturel : l'agent derrière maintient une distance de sécurité avec celui devant lui, avec un ralentissement fluide allant de 100% à 15% de la vitesse normale.

### 8.5. Stratégie 3 : Répulsion Générale (Overlap Prevention)

Pour les cas où deux agents se retrouvent extrêmement proches (distance < 20 unités), une **force de répulsion radiale** les pousse en sens opposé :

```javascript
repulsion = (20 - separation) / 20;
dodgeX -= (sepX / sepDist) * speed * repulsion * 0.3;
dodgeY -= (sepY / sepDist) * speed * repulsion * 0.3;
```

Ce mécanisme agit comme un « ressort » entre les agents, garantissant qu'ils ne se chevauchent jamais visuellement, même en cas de convergence rapide.

### 8.6. Désactivation à l'Arrivée (Anti-Orbiting)

Un problème critique identifié et résolu est le **phénomène d'orbite** : lorsque deux agents arrivent au même nœud de destination, les forces de répulsion les font tourner indéfiniment l'un autour de l'autre.

La solution : le système désactive **entièrement** l'évitement de collision quand un agent arrive à sa destination finale (`path.length <= 1 && dist < 25`). L'agent atteint son nœud cible sans perturbation, et c'est le **système de stationnement** (section suivante) qui prend le relais pour les éloigner.

---

## 9. Stationnement Intelligent des Agents Inactifs (Idle Parking)

### 9.1. Problématique

Sans gestion spécifique, les agents inactifs (sans commande ni tâche assignée) restent immobiles à leur dernière position. Si deux agents terminent leur tâche au même nœud du graphe, ils se superposent visuellement, ce qui est irréaliste.

### 9.2. Mécanisme de Détection et Relocalisation

Au début de chaque cycle de mise à jour, quand un agent est en état `idle`, le système vérifie si un autre agent se trouve à moins de **25 unités** :

```javascript
const tooClose = this.agents.find(other =>
    other.id !== agent.id &&
    Math.sqrt((other.x - agent.x)² + (other.y - agent.y)²) < 25
);
```

Si c'est le cas, le système :
1. Identifie le **nœud le plus proche** de l'agent via `findNearestNode()`
2. Récupère les **nœuds voisins** via `getNeighbors()` (nœuds connectés par une arête dans le graphe)
3. Cherche un nœud voisin **libre** (aucun autre agent à moins de 30 unités)
4. Assigne ce nœud comme destination et passe l'agent en état `relocating`

### 9.3. État FSM « Relocating »

Un nouvel état `relocating` a été ajouté à la machine à états finis des agents. Cet état est traité dans la section des transitions d'état (`STATE TRANSITIONS`) de `updateAgentBehavior()`. Une fois que l'agent atteint le nœud libre, il repasse automatiquement en état `idle`, prêt à recevoir de nouvelles tâches.

Ce mécanisme garantit que les agents inactifs sont toujours visuellement séparés les uns des autres, occupant chacun un nœud distinct du graphe de l'entrepôt.

---

## 10. Défis et Calibration du Système d'Évitement

### 10.1. Proportionnalité des Forces

L'un des défis majeurs a été de calibrer les forces d'esquive pour qu'elles soient **perceptibles mais pas déstabilisantes**. Les premières implémentations utilisaient des constantes fixes (ex: `dodgeX += 12 * pushStrength`), ce qui produisait des décalages de seulement 0.2 unité/frame — totalement invisibles. La solution retenue consiste à rendre les forces **proportionnelles à la vitesse de l'agent** (`speed * pushStrength * 0.6`), garantissant un décalage visible quelle que soit la vitesse de simulation.

### 10.2. Symétrie de l'Esquive

Une autre optimisation notable : l'esquive frontale est **symétrique**. Les deux agents esquivent vers leur droite respective simultanément. Puisqu'ils se font face, « la droite de l'un » est « la gauche de l'autre », ce qui garantit qu'ils s'écartent de directions opposées — exactement comme deux piétons se croisant dans un couloir étroit.

### 10.3. Paramètres de Configuration

| Paramètre | Valeur | Description |
|---|---|---|
| `COLLISION_DIST` | 75 | Rayon de détection de collision (unités de simulation) |
| Seuil Head-on | `dot < -0.3` | Produit scalaire sous lequel la rencontre est considérée frontale |
| Force d'esquive | `speed × 0.6` | Force latérale proportionnelle à la vitesse |
| Seuil de répulsion | 20 unités | Distance sous laquelle la répulsion radiale s'active |
| Distance idle | 25 unités | Distance minimale entre agents inactifs |
| Distance parking | 30 unités | Distance minimale pour qu'un nœud soit considéré « libre » |

---

## 11. Conclusion et Perspectives

Le **Digital Twin Warehouse** démontre la robustesse de l'écosystème React pour gérer de front une logique applicative exigeante et un rendu graphique 3D intensif, le tout hébergé directement dans un simple navigateur web. Le système algorithmique universel (Pathfinding A*, FSM, R-Trees abstraits) est assez flexible pour être adapté à d'autres industries complexes.

L'ajout d'animations procédurales de type FlexSim et l'introduction d'un véritable tapis roulant texturé et fonctionnel poussent l'immersion technologique à son paroxysme sans dépendre d'outils propriétaires hors de prix, fournissant un excellent bac à sable logistique aux décideurs.

Le système d'évitement de collisions apporte un niveau de réalisme supplémentaire à la simulation, reproduisant fidèlement le comportement d'opérateurs humains dans un entrepôt réel : esquive latérale dans les couloirs étroits, maintien de distances de sécurité, et stationnement intelligent en cas d'inactivité. Ces mécanismes, entièrement intégrés au moteur existant sans modification du pathfinding, démontrent la modularité et l'extensibilité de l'architecture choisie.

**Fin du document.**

