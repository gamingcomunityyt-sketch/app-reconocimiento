export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-6">
      <h1 className="text-3xl font-semibold tracking-tight">Recuerdos</h1>
      <p className="text-base text-balance opacity-80">
        Vincula recuerdos digitales a objetos fisicos y encuentralos apuntando con la
        camara.
      </p>
      <p className="text-sm opacity-60">
        Fase 0 completada: base del proyecto lista. La biblioteca de recuerdos y el
        escaneo llegan en las fases siguientes.
      </p>
    </main>
  );
}
