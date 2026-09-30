/**
 * Belső Feladatkezelő (Task Manager) — Port.
 *
 * A VII. Modul / E) fogja a teljes értékű feladatkezelőt megvalósítani
 * (kötelező paraméterek, felelős, határidő, vezetői ellenőrzés). Amíg elkészül,
 * ez az interfész a csatlakozási pont: a modulok (pl. I/E hívásvégi jegyzet
 * visszahívási igénye) ezen keresztül generálnak feladatot. Jelenleg egy
 * minimál DB-implementáció áll mögötte.
 */

export interface NewTask {
  /** Rövid cím / teendő. */
  title: string;
  /** Részletek (pl. a jegyzet szövege). */
  detail?: string;
  /** Kapcsolódó beteg (a feladat az ő adatlapjához köthető). */
  partnerCode?: string;
  /** A feladatot kiváltó forrás (pl. 'call_note'). */
  source: string;
  /** Kapcsolódó entitás azonosítója (pl. a hívás id-ja). */
  refId?: string;
}

export interface TaskPort {
  create(task: NewTask): Promise<{ id: string }>;
}

export const TASK_PORT = Symbol('TASK_PORT');
