terraform {
  required_providers {
    azurerm = {
      source = "hashicorp/azurerm"
    }
  }
}

provider "azurerm" {
  features {}
}

variable "location" {
  type        = string
  description = "The Azure region of every resource, for example westeurope."
}

variable "resource_group_name" {
  type        = string
  description = "The resource group of every resource."
}

variable "vm_size" {
  type        = string
  description = "The size of virtual machines, for example Standard_B2s."
}

resource "azurerm_virtual_network" "vnet" {
  name                = "vnet"
  location            = var.location
  resource_group_name = var.resource_group_name
  address_space       = ["10.1.0.0/16"]
}

resource "azurerm_subnet" "gw-subnet" {
  name                 = "gw-subnet"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = ["10.1.0.0/24"]
}

resource "azurerm_subnet" "app-subnet" {
  name                 = "app-subnet"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = ["10.1.1.0/24"]
}

resource "azurerm_subnet" "ops-subnet" {
  name                 = "ops-subnet"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = ["10.1.2.0/24"]
}

resource "azurerm_application_gateway" "appgw" {
  name                = "appgw"
  location            = var.location
  resource_group_name = var.resource_group_name
  zones               = ["1", "2"]
}

resource "azurerm_linux_virtual_machine_scale_set" "web" {
  name                = "web"
  location            = var.location
  resource_group_name = var.resource_group_name
  sku                 = var.vm_size
  zones               = ["1", "2", "3"]
}

resource "azurerm_nat_gateway" "nat" {
  name                = "nat"
  location            = var.location
  resource_group_name = var.resource_group_name
  zones               = ["1"]
}

resource "azurerm_subnet_nat_gateway_association" "nat_association_app-subnet" {
  subnet_id      = azurerm_subnet.app-subnet.id
  nat_gateway_id = azurerm_nat_gateway.nat.id
}

resource "azurerm_linux_virtual_machine" "jump" {
  name                = "jump"
  location            = var.location
  resource_group_name = var.resource_group_name
  size                = var.vm_size
  zone                = "1"
}

resource "azurerm_linux_virtual_machine" "batch" {
  name                = "batch"
  location            = var.location
  resource_group_name = var.resource_group_name
  size                = var.vm_size
}

resource "azurerm_cosmosdb_account" "orders" {
  name                = "orders"
  location            = var.location
  resource_group_name = var.resource_group_name
  offer_type          = "Standard"

  geo_location {
    location          = var.location
    failover_priority = 0
    zone_redundant    = true
  }
}

resource "azurerm_network_security_group" "gw-nsg" {
  name                = "gw-nsg"
  location            = var.location
  resource_group_name = var.resource_group_name

  security_rule {
    name                       = "rule-100"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "Internet"
    destination_address_prefix = "*"
  }
}

resource "azurerm_subnet_network_security_group_association" "gw-nsg_association_gw-subnet" {
  subnet_id                 = azurerm_subnet.gw-subnet.id
  network_security_group_id = azurerm_network_security_group.gw-nsg.id
}

resource "azurerm_network_security_group" "web-nsg" {
  name                = "web-nsg"
  location            = var.location
  resource_group_name = var.resource_group_name

  security_rule {
    name                       = "rule-100"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "80"
    destination_address_prefix = "*"
    source_address_prefixes    = azurerm_subnet.gw-subnet.address_prefixes
  }

  security_rule {
    name                       = "rule-110"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Deny"
    protocol                   = "*"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "*"
  }
}

resource "azurerm_network_security_group" "ops-nsg" {
  name                = "ops-nsg"
  location            = var.location
  resource_group_name = var.resource_group_name

  security_rule {
    name                       = "rule-100"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = "Internet"
    destination_address_prefix = "*"
  }
}

resource "azurerm_subnet_network_security_group_association" "ops-nsg_association_ops-subnet" {
  subnet_id                 = azurerm_subnet.ops-subnet.id
  network_security_group_id = azurerm_network_security_group.ops-nsg.id
}
