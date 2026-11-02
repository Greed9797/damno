-- Illegal Soccer — REA-mapped cheat script
-- Place: 126987974021910 | Universe: 10155360168
-- Remotes confirmados via REA (log analysis):
--   ReplicatedStorage.Remotes.Ball.MovementUpdate
--   ReplicatedStorage.Remotes.Ball.Tilt
--   ReplicatedStorage.Remotes.Ball.ActionPresentationUpdate
--   ReplicatedStorage.Remotes.Items.ProjectileMovement

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")
local StarterGui = game:GetService("StarterGui")

local LocalPlayer = Players.LocalPlayer
local Camera = Workspace.CurrentCamera

-- ========== REMOTE DISCOVERY ==========
local KnownRemotes = {}
local AllRemotes = {}

local function ScanRemotes(folder)
    if not folder then return end
    for _, obj in ipairs(folder:GetDescendants()) do
        if obj:IsA("RemoteEvent") or obj:IsA("RemoteFunction") then
            AllRemotes[obj] = {
                ClassName = obj.ClassName,
                FullName = obj:GetFullName(),
                Parent = obj.Parent and obj.Parent.Name or "?"
            }
        end
    end
end

-- initial scan
local rsRemotes = ReplicatedStorage:FindFirstChild("Remotes")
ScanRemotes(rsRemotes)
ScanRemotes(ReplicatedStorage)

-- known mapped remotes
KnownRemotes.BallMovement = rsRemotes and rsRemotes:FindFirstChild("Ball") and rsRemotes.Ball:FindFirstChild("MovementUpdate")
KnownRemotes.BallTilt = rsRemotes and rsRemotes:FindFirstChild("Ball") and rsRemotes.Ball:FindFirstChild("Tilt")
KnownRemotes.BallAction = rsRemotes and rsRemotes:FindFirstChild("Ball") and rsRemotes.Ball:FindFirstChild("ActionPresentationUpdate")
KnownRemotes.Projectile = rsRemotes and rsRemotes:FindFirstChild("Items") and rsRemotes.Items:FindFirstChild("ProjectileMovement")

-- ========== STATE ==========
local State = {
    ESP = false,
    BallESP = false,
    Speed = false,
    SpeedVal = 50,
    Fly = false,
    NoClip = false,
    AutoRejoin = true,
    LogRemotes = false,
    InfiniteJump = false,
}

-- ========== UTILITY ==========
local function GetCharacter()
    return LocalPlayer.Character or LocalPlayer.CharacterAdded:Wait()
end

local function GetRoot()
    local c = GetCharacter()
    return c and c:FindFirstChild("HumanoidRootPart")
end

local function GetHumanoid()
    local c = GetCharacter()
    return c and c:FindFirstChildOfClass("Humanoid")
end

local function Notify(msg)
    pcall(function()
        StarterGui:SetCore("SendNotification", {
            Title = "Illegal Soccer REA",
            Text = msg,
            Duration = 3
        })
    end)
    print("[REA] " .. msg)
end

-- ========== ESP ==========
local ESPLooping = false
local ESPObjects = {}

local function CreateESP(player)
    if player == LocalPlayer then return end
    local function Setup(char)
        if ESPObjects[player] then
            for _, v in pairs(ESPObjects[player]) do v:Remove() end
        end
        ESPObjects[player] = {}

        local hrp = char:WaitForChild("HumanoidRootPart", 5)
        if not hrp then return end

        -- BillboardGui
        local bb = Instance.new("BillboardGui")
        bb.Name = "REA_ESP"
        bb.Adornee = hrp
        bb.Size = UDim2.new(0, 100, 0, 40)
        bb.StudsOffset = Vector3.new(0, 3, 0)
        bb.AlwaysOnTop = true
        bb.Parent = char

        local label = Instance.new("TextLabel")
        label.Size = UDim2.new(1, 0, 0.5, 0)
        label.BackgroundTransparency = 1
        label.Text = player.DisplayName
        label.TextColor3 = Color3.new(1, 0.2, 0.2)
        label.TextStrokeTransparency = 0
        label.Font = Enum.Font.GothamBold
        label.TextSize = 14
        label.Parent = bb

        -- Tracer (3D line via beam-like part)
        local part = Instance.new("Part")
        part.Name = "REA_Tracer"
        part.Anchored = true
        part.CanCollide = false
        part.Transparency = 0.5
        part.Material = Enum.Material.Neon
        part.Color = Color3.new(1, 0.2, 0.2)
        part.Size = Vector3.new(0.1, 0.1, 0.1)
        part.Parent = Workspace

        table.insert(ESPObjects[player], bb)
        table.insert(ESPObjects[player], part)
    end

    if player.Character then Setup(player.Character) end
    player.CharacterAdded:Connect(Setup)
end

local function RemoveESP(player)
    if ESPObjects[player] then
        for _, v in pairs(ESPObjects[player]) do v:Remove() end
        ESPObjects[player] = nil
    end
end

local function StartESP()
    ESPLooping = true
    for _, p in ipairs(Players:GetPlayers()) do CreateESP(p) end
    Players.PlayerAdded:Connect(CreateESP)
    Players.PlayerRemoving:Connect(RemoveESP)

    RunService.Heartbeat:Connect(function()
        if not State.ESP then return end
        local root = GetRoot()
        if not root then return end
        for player, objs in pairs(ESPObjects) do
            local char = player.Character
            local hrp = char and char:FindFirstChild("HumanoidRootPart")
            if hrp then
                for _, obj in ipairs(objs) do
                    if obj.Name == "REA_Tracer" then
                        local mid = (root.Position + hrp.Position) / 2
                        local dist = (hrp.Position - root.Position).Magnitude
                        obj.Size = Vector3.new(0.05, 0.05, dist)
                        obj.CFrame = CFrame.lookAt(root.Position, hrp.Position) * CFrame.new(0, 0, -dist/2)
                    end
                end
            end
        end
    end)
end

local function StopESP()
    ESPLooping = false
    for p, _ in pairs(ESPObjects) do RemoveESP(p) end
end

-- Ball ESP
local function GetBall()
    -- try common names
    for _, name in ipairs({"Ball", "SoccerBall", "Football", "bola"}) do
        local b = Workspace:FindFirstChild(name)
        if b then return b end
    end
    -- scan descendants
    for _, obj in ipairs(Workspace:GetDescendants()) do
        if obj:IsA("BasePart") and obj.Name:lower():find("ball") then
            return obj
        end
    end
    return nil
end

local BallESPPart = nil
local function ToggleBallESP()
    State.BallESP = not State.BallESP
    if State.BallESP then
        BallESPPart = Instance.new("Part")
        BallESPPart.Name = "REA_BallESP"
        BallESPPart.Anchored = true
        BallESPPart.CanCollide = false
        BallESPPart.Transparency = 0.3
        BallESPPart.Material = Enum.Material.Neon
        BallESPPart.Color = Color3.new(0, 1, 0.5)
        BallESPPart.Shape = Enum.PartType.Ball
        BallESPPart.Size = Vector3.new(2, 2, 2)
        BallESPPart.Parent = Workspace

        RunService.Heartbeat:Connect(function()
            if not State.BallESP or not BallESPPart then return end
            local ball = GetBall()
            if ball then
                BallESPPart.CFrame = ball.CFrame
                BallESPPart.Transparency = 0.3
            else
                BallESPPart.Transparency = 1
            end
        end)
        Notify("Ball ESP ON")
    else
        if BallESPPart then BallESPPart:Remove() BallESPPart = nil end
        Notify("Ball ESP OFF")
    end
end

-- ========== SPEED ==========
RunService.Heartbeat:Connect(function()
    if State.Speed then
        local hum = GetHumanoid()
        if hum then hum.WalkSpeed = State.SpeedVal end
    end
end)

-- ========== FLY ==========
local flySpeed = 60
local bodyGyro, bodyVelocity
local function StartFly()
    local root = GetRoot()
    if not root then return end
    bodyGyro = Instance.new("BodyGyro")
    bodyGyro.MaxTorque = Vector3.new(9e9, 9e9, 9e9)
    bodyGyro.P = 9e4
    bodyGyro.Parent = root

    bodyVelocity = Instance.new("BodyVelocity")
    bodyVelocity.MaxForce = Vector3.new(9e9, 9e9, 9e9)
    bodyVelocity.Velocity = Vector3.new(0, 0, 0)
    bodyVelocity.Parent = root

    local flyConn
    flyConn = RunService.Heartbeat:Connect(function()
        if not State.Fly then
            if bodyGyro then bodyGyro:Remove() end
            if bodyVelocity then bodyVelocity:Remove() end
            flyConn:Disconnect()
            return
        end
        local camCF = Camera.CFrame
        local dir = Vector3.new(0, 0, 0)
        if UserInputService:IsKeyDown(Enum.KeyCode.W) then dir = dir + camCF.LookVector end
        if UserInputService:IsKeyDown(Enum.KeyCode.S) then dir = dir - camCF.LookVector end
        if UserInputService:IsKeyDown(Enum.KeyCode.A) then dir = dir - camCF.RightVector end
        if UserInputService:IsKeyDown(Enum.KeyCode.D) then dir = dir + camCF.RightVector end
        if UserInputService:IsKeyDown(Enum.KeyCode.Space) then dir = dir + Vector3.new(0, 1, 0) end
        if UserInputService:IsKeyDown(Enum.KeyCode.LeftControl) then dir = dir - Vector3.new(0, 1, 0) end
        bodyVelocity.Velocity = dir.Magnitude > 0 and dir.Unit * flySpeed or Vector3.new(0, 0, 0)
        bodyGyro.CFrame = camCF
    end)
end

-- ========== NOCLIP ==========
RunService.Stepped:Connect(function()
    if State.NoClip then
        local char = GetCharacter()
        if char then
            for _, part in ipairs(char:GetDescendants()) do
                if part:IsA("BasePart") and part.CanCollide then
                    part.CanCollide = false
                end
            end
        end
    end
end)

-- ========== INFINITE JUMP ==========
UserInputService.JumpRequest:Connect(function()
    if State.InfiniteJump then
        local hum = GetHumanoid()
        if hum then hum:ChangeState(Enum.HumanoidStateType.Jumping) end
    end
end)

-- ========== REMOTE LOGGER ==========
local function LogAllRemotes()
    print("===== REA REMOTE SCAN =====")
    print("Place: 126987974021910 | Universe: 10155360168")
    print("---- Known (from REA log analysis) ----")
    for name, remote in pairs(KnownRemotes) do
        print(name, "=>", remote and remote:GetFullName() or "NOT FOUND")
    end
    print("---- All found remotes ----")
    for obj, info in pairs(AllRemotes) do
        print(string.format("[%s] %s (parent: %s)", info.ClassName, info.FullName, info.Parent))
    end
    print("---- Rescanning live ----")
    ScanRemotes(ReplicatedStorage)
    for obj, info in pairs(AllRemotes) do
        if obj.Parent then
            print(string.format("[LIVE][%s] %s", info.ClassName, info.FullName))
        end
    end
    print("===== END SCAN =====")
end

-- ========== BALL CONTROL ==========
-- Fire MovementUpdate to control ball position remotely
local function TeleportBallToMe()
    local ball = GetBall()
    local root = GetRoot()
    if ball and root and KnownRemotes.BallMovement then
        pcall(function()
            KnownRemotes.BallMovement:FireServer(root.Position + Vector3.new(0, 5, 0))
        end)
        Notify("Ball teleport attempted")
    else
        Notify("Ball or remote not found")
    end
end

-- ========== UI ==========
local function CreateUI()
    -- ScreenGui
    local gui = Instance.new("ScreenGui")
    gui.Name = "REA_IllegalSoccer"
    gui.ResetOnSpawn = false
    gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
    gui.Parent = LocalPlayer:WaitForChild("PlayerGui")

    -- Main frame
    local main = Instance.new("Frame")
    main.Name = "Main"
    main.Size = UDim2.new(0, 280, 0, 420)
    main.Position = UDim2.new(0, 10, 0.3, 0)
    main.BackgroundColor3 = Color3.fromRGB(15, 15, 25)
    main.BorderSizePixel = 0
    main.Active = true
    main.Draggable = true
    main.Parent = gui

    local corner = Instance.new("UICorner")
    corner.CornerRadius = UDim.new(0, 8)
    corner.Parent = main

    local stroke = Instance.new("UIStroke")
    stroke.Color = Color3.fromRGB(0, 200, 100)
    stroke.Thickness = 2
    stroke.Parent = main

    -- Title
    local title = Instance.new("TextLabel")
    title.Size = UDim2.new(1, 0, 0, 40)
    title.BackgroundTransparency = 1
    title.Text = "ILLEGAL SOCCER — REA"
    title.TextColor3 = Color3.fromRGB(0, 255, 130)
    title.Font = Enum.Font.GothamBlack
    title.TextSize = 16
    title.Parent = main

    local subtitle = Instance.new("TextLabel")
    subtitle.Size = UDim2.new(1, 0, 0, 20)
    subtitle.Position = UDim2.new(0, 0, 0, 35)
    subtitle.BackgroundTransparency = 1
    subtitle.Text = "Place 126987974021910 | REA Mapped"
    subtitle.TextColor3 = Color3.fromRGB(100, 100, 120)
    subtitle.Font = Enum.Font.Gotham
    subtitle.TextSize = 10
    subtitle.Parent = main

    -- Toggle buttons helper
    local yPos = 65
    local function MakeToggle(name, stateKey, callback)
        local btn = Instance.new("TextButton")
        btn.Size = UDim2.new(1, -20, 0, 32)
        btn.Position = UDim2.new(0, 10, 0, yPos)
        btn.BackgroundColor3 = Color3.fromRGB(30, 30, 45)
        btn.Text = name .. ": OFF"
        btn.TextColor3 = Color3.fromRGB(200, 200, 200)
        btn.Font = Enum.Font.GothamSemibold
        btn.TextSize = 13
        btn.Parent = main

        local bc = Instance.new("UICorner")
        bc.CornerRadius = UDim.new(0, 6)
        bc.Parent = btn

        btn.MouseButton1Click:Connect(function()
            State[stateKey] = not State[stateKey]
            local on = State[stateKey]
            btn.Text = name .. ": " .. (on and "ON" or "OFF")
            btn.BackgroundColor3 = on and Color3.fromRGB(0, 80, 40) or Color3.fromRGB(30, 30, 45)
            btn.TextColor3 = on and Color3.fromRGB(0, 255, 130) or Color3.fromRGB(200, 200, 200)
            if callback then callback(on) end
        end)
        yPos = yPos + 38
        return btn
    end

    local function MakeButton(name, callback)
        local btn = Instance.new("TextButton")
        btn.Size = UDim2.new(1, -20, 0, 32)
        btn.Position = UDim2.new(0, 10, 0, yPos)
        btn.BackgroundColor3 = Color3.fromRGB(40, 25, 50)
        btn.Text = name
        btn.TextColor3 = Color3.fromRGB(255, 180, 100)
        btn.Font = Enum.Font.GothamSemibold
        btn.TextSize = 13
        btn.Parent = main

        local bc = Instance.new("UICorner")
        bc.CornerRadius = UDim.new(0, 6)
        bc.Parent = btn

        btn.MouseButton1Click:Connect(callback)
        yPos = yPos + 38
        return btn
    end

    MakeToggle("Player ESP", "ESP", function(on)
        if on then StartESP() else StopESP() end
        Notify("ESP " .. (on and "ON" or "OFF"))
    end)

    MakeButton("Ball ESP", ToggleBallESP)
    MakeToggle("Speed 50", "Speed", function(on)
        if not on then
            local hum = GetHumanoid()
            if hum then hum.WalkSpeed = 16 end
        end
        Notify("Speed " .. (on and "ON" or "OFF"))
    end)
    MakeToggle("Fly (WASD+Space)", "Fly", function(on)
        if on then StartFly() end
        Notify("Fly " .. (on and "ON" or "OFF"))
    end)
    MakeToggle("NoClip", "NoClip", Notify)
    MakeToggle("Infinite Jump", "InfiniteJump", Notify)
    MakeButton("Teleport Ball", TeleportBallToMe)
    MakeButton("Dump Remotes", LogAllRemotes)

    -- Hotkeys
    UserInputService.InputBegan:Connect(function(input, gpe)
        if gpe then return end
        if input.KeyCode == Enum.KeyCode.F1 then
            State.ESP = not State.ESP
            if State.ESP then StartESP() else StopESP() end
        elseif input.KeyCode == Enum.KeyCode.F2 then
            ToggleBallESP()
        elseif input.KeyCode == Enum.KeyCode.F4 then
            State.Fly = not State.Fly
            if State.Fly then StartFly() end
        elseif input.KeyCode == Enum.KeyCode.F6 then
            State.NoClip = not State.NoClip
        end
    end)

    Notify("Illegal Soccer REA loaded. F1=ESP F2=BallESP F4=Fly F6=NoClip")
    LogAllRemotes()
end

-- ========== INIT ==========
CreateUI()
Notify("REA mapped: 4 remotes confirmed | Ball.* + Items.*")
