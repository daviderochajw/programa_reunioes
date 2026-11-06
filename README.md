# Painel da congregação – Braga Central

Guia SEM instalar nada no computador: só um navegador (Chrome, Edge, Safari ou Firefox).
Tempo: cerca de 40 minutos. Faça os passos pela ordem.

## PARTE A · Supabase (guarda os dados e as contas)
1. Abra https://supabase.com → **Start your project** → entre com a sua conta do GitHub (ou crie uma conta).
2. **New project**: dê um nome (ex.: braga-central), crie uma **palavra-passe da base de dados** (guarde-a num gestor de palavras-passe) e escolha a região **West EU (Ireland)** ou **Central EU (Frankfurt)**. Clique **Create** e espere ~2 minutos.
3. Menu da esquerda **Authentication → Sign In / Providers → Email**: desligue **Confirm email** e ponha **Minimum password length = 8**. **Save**.
4. Menu da esquerda **SQL Editor → New query**. Abra o ficheiro `supabase/setup-completo.sql` (Bloco de notas), copie TUDO, cole no Supabase e clique **Run**. Deve aparecer «Success».
5. Menu **Project Settings → API** (ou «Data API»/«API Keys»). Copie e guarde num bloco de notas:
   - **Project URL** (https://xxxx.supabase.co)
   - a chave **anon / publishable** (NUNCA a `service_role`).

## PARTE B · GitHub (guarda o código e publica a app)
1. https://github.com → **Sign up**. Depois ative **dois passos**: foto de perfil → Settings → Password and authentication.
2. **+ (canto superior direito) → New repository**. Nome: `painel-braga-central`. Escolha **Public**. Não marque nada mais → **Create repository**.
3. No computador, extraia o ficheiro ZIP (Windows: botão direito → Extrair tudo; Mac: duplo clique). No Mac, carregue em Cmd+Shift+. para ver pastas escondidas.
4. Na página do repositório clique em **uploading an existing file**. Abra a pasta extraída, selecione **o conteúdo** (Ctrl+A, para que o `package.json` fique à vista, não a pasta em si) e arraste para a janela do GitHub. Espere acabar → **Commit changes**.
5. Confirme que no repositório aparece a pasta `.github`. Se não aparecer: **Add file → Create new file**, escreva no nome `.github/workflows/deploy.yml` (as barras criam as pastas), cole o conteúdo do ficheiro `deploy.yml` do ZIP e **Commit changes**.
6. **Settings → Secrets and variables → Actions → New repository secret** (duas vezes):
   - Nome `VITE_SUPABASE_URL` → valor: o Project URL
   - Nome `VITE_SUPABASE_ANON_KEY` → valor: a chave anon/publishable
7. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
8. Separador **Actions**: abra a execução «Publicar no GitHub Pages» → se estiver a vermelho ou não existir, **Re-run all jobs**. Quando ficar a verde (✓, ~2 min), o endereço da app aparece em **Settings → Pages**: `https://SEU-UTILIZADOR.github.io/painel-braga-central/`.

## PARTE C · Primeiro acesso (torna-se administrador)
1. Abra o endereço da app → **Criar conta** (use um nome pouco óbvio e uma palavra-passe longa).
2. No Supabase: **Table Editor → profiles**. Na sua linha, clique duas vezes em `role` e escreva `admin`; em `status` escreva `approved`. Enter.
3. Volte à app, saia e entre outra vez. Já vê Utilizadores, Importar Excel, etc.
4. **⋯ → Importar Excel** para carregar os dados (não ponha o Excel no GitHub!).

## Instalar no telemóvel / computador
Android (Chrome): ⋮ → Instalar aplicação · iPhone (Safari): Partilhar → Adicionar ao ecrã principal · PC (Chrome/Edge): ícone «Instalar» na barra de endereço.

## Atualizar a app mais tarde
No GitHub abra o ficheiro → ícone do lápis → edite → **Commit changes**. A app é republicada sozinha.

## Segurança (importante)
- No GitHub fica só o **código**. Dados da congregação, Excel e HTML antigo **nunca** vão para o GitHub.
- Só duas chaves são usadas e a anon é pública por desenho; a `service_role` nunca se cola em lado nenhum.
- Os dados só se veem com conta aprovada e menu atribuído (regras na base de dados).
- Ative dois passos no GitHub e no Supabase. Aprove só pessoas que conhece. Dê «Contactos», «Irmãos» e «Novos e batismos» só a quem precisa.
- Esquecimento de palavra-passe: Supabase → Authentication → Users → eliminar o utilizador; a pessoa regista-se de novo e o administrador aprova. (Os botões «Repor palavra-passe» e «Eliminar» da app precisam da função opcional `admin-users`; pode ignorá-los.)

## Opcional: Capacitor e testes
Lojas Android/iOS (precisa de instalar ferramentas) e `npm test` são só para programadores; não são necessários.
